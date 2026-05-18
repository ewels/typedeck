import {
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { clipboard, Key, keyboard } from "@nut-tree-fork/nut-js";

// `autoDelayMs` is nut-js's own sleep between chars; `setKeyboardDelay` overrides
// the native libnut delay that otherwise blocks the JS thread for ~300 ms per
// keystroke and starves the websocket loop, preventing a second keyDown press
// from ever being received mid-typing.
keyboard.config.autoDelayMs = 0;
getNutKeyboardProvider().setKeyboardDelay(0);

function getNutKeyboardProvider(): { setKeyboardDelay(ms: number): void } {
  return (
    keyboard as unknown as {
      providerRegistry: {
        getKeyboard(): { setKeyboardDelay(ms: number): void };
      };
    }
  ).providerRegistry.getKeyboard();
}

export type BaseTypingSettings = {
  text?: string;
  charDelay?: number | string;
  wordDelay?: number | string;
  paragraphDelay?: number | string;

  jitterEnabled?: boolean;
  jitterPercent?: number | string;
  typosEnabled?: boolean;
  typoChance?: number | string;

  counter?: number;
  cancelOnSecondPress?: boolean;
};

export const DEFAULTS = {
  charDelay: 5,
  wordDelay: 40,
  paragraphDelay: 400,
  initialDelay: 300,
  jitterPercent: 100,
  typoChance: 3,
  typoCorrectionMs: 400,
  longPressThresholdMs: 500,
} as const;

const PREVIEW_MAX_LEN = 20;

// Always go via setTimeout — `Promise.resolve()` only flushes microtasks, which
// doesn't let the websocket message queue (a macrotask) process a second
// keyDown event mid-typing.
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export function toNumber(value: unknown, fallback: number): number {
  const n =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function previewTitle(text: string | undefined): string {
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "Type";
  return collapsed.length > PREVIEW_MAX_LEN
    ? `${collapsed.slice(0, PREVIEW_MAX_LEN)}…`
    : collapsed;
}

// QWERTY physical-key adjacency. Lower-case lookup; case is restored by the
// caller.
const QWERTY_ADJACENT: Record<string, string> = {
  q: "wa",
  w: "qeasd",
  e: "wrsdf",
  r: "etdfg",
  t: "ryfgh",
  y: "tughj",
  u: "yihjk",
  i: "uojkl",
  o: "ipkl",
  p: "ol",
  a: "qwsz",
  s: "awedzx",
  d: "serfxc",
  f: "drtgcv",
  g: "ftyhvb",
  h: "gyujbn",
  j: "huiknm",
  k: "jiolm",
  l: "kop",
  z: "asx",
  x: "zsdc",
  c: "xdfv",
  v: "cfgb",
  b: "vghn",
  n: "bhjm",
  m: "njk",
};

function adjacentKey(char: string): string | null {
  const lower = char.toLowerCase();
  const neighbours = QWERTY_ADJACENT[lower];
  if (!neighbours) return null;
  const pick = neighbours[Math.floor(Math.random() * neighbours.length)];
  return char === lower ? pick : pick.toUpperCase();
}

function applyJitter(ms: number, pct: number): number {
  if (ms <= 0 || pct <= 0) return ms;
  const factor = 1 + ((Math.random() * 2 - 1) * pct) / 100;
  return Math.max(0, Math.round(ms * factor));
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const VAR_PATTERN = /\{\{|\}\}|\{(date|time|counter|clipboard)\}/g;

async function expandVariables(text: string, counter: number): Promise<string> {
  if (!text.includes("{")) return text;
  const clip = text.includes("{clipboard}")
    ? await clipboard.getContent().catch(() => "")
    : "";
  return text.replace(VAR_PATTERN, (match, name) => {
    if (match === "{{") return "{";
    if (match === "}}") return "}";
    switch (name) {
      case "date":
        return new Date().toISOString().slice(0, 10);
      case "time": {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      }
      case "counter":
        return String(counter);
      case "clipboard":
        return clip;
      default:
        return match;
    }
  });
}

/**
 * Result of picking the text to type for a single press.
 * `update` is merged into settings and persisted before typing starts, so an
 * aborted run still advances cycle index / counter.
 */
export type PickResult<S> = {
  text: string;
  update?: Partial<S>;
} | null;

export abstract class BaseTypeAction<
  S extends BaseTypingSettings,
> extends SingletonAction<S> {
  private isTyping = false;
  private abortRequested = false;
  private queuedRun = false;

  /** Subclass-specific text selection. Long-press handling is opt-in. */
  protected abstract pickText(settings: S): PickResult<S>;

  /** Override in TypeAction to return the long-press text. */
  protected pickLongPressText(_settings: S): string | null {
    return null;
  }

  protected longPressThreshold(_settings: S): number {
    return DEFAULTS.longPressThresholdMs;
  }

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressFired = false;

  override onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
    return ev.action.setTitle(previewTitle(ev.payload.settings.text));
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
    return ev.action.setTitle(previewTitle(ev.payload.settings.text));
  }

  override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
    const { settings } = ev.payload;

    if (this.isTyping) {
      if (settings.cancelOnSecondPress) {
        this.abortRequested = true;
      } else {
        this.queuedRun = true;
      }
      return;
    }

    const longText = this.pickLongPressText(settings);
    if (longText !== null) {
      const threshold = this.longPressThreshold(settings);
      this.longPressFired = false;
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this.longPressFired = true;
        void this.runTyping(ev.action, settings, longText);
      }, threshold);
      return;
    }

    await this.runTyping(ev.action, settings, null);
  }

  override async onKeyUp(ev: KeyUpEvent<S>): Promise<void> {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.longPressFired) {
      this.longPressFired = false;
      return;
    }
    if (this.pickLongPressText(ev.payload.settings) !== null) {
      await this.runTyping(ev.action, ev.payload.settings, null);
    }
  }

  private async runTyping(
    action: KeyDownEvent<S>["action"],
    settings: S,
    longPressText: string | null,
  ): Promise<void> {
    if (this.isTyping) return;
    this.isTyping = true;
    this.abortRequested = false;

    try {
      let picked: PickResult<S>;
      if (longPressText !== null) {
        picked = { text: longPressText };
      } else {
        picked = this.pickText(settings);
      }
      if (!picked || !picked.text) return;

      const usesCounter = picked.text.includes("{counter}");
      const counterValue =
        toNumber(settings.counter, 0) + (usesCounter ? 1 : 0);
      const text = await expandVariables(picked.text, counterValue);

      // Persist before typing so an aborted run still advances state.
      const update: Partial<S> & Partial<BaseTypingSettings> = picked.update
        ? { ...picked.update }
        : {};
      if (usesCounter) update.counter = counterValue;
      if (Object.keys(update).length > 0) {
        await action.setSettings({ ...settings, ...update } as S);
      }

      const charDelay = toNumber(settings.charDelay, DEFAULTS.charDelay);
      const wordDelay = toNumber(settings.wordDelay, DEFAULTS.wordDelay);
      const paragraphDelay = toNumber(
        settings.paragraphDelay,
        DEFAULTS.paragraphDelay,
      );
      const jitterPct = settings.jitterEnabled
        ? toNumber(settings.jitterPercent, DEFAULTS.jitterPercent)
        : 0;
      const typoChance = settings.typosEnabled
        ? toNumber(settings.typoChance, DEFAULTS.typoChance) / 100
        : 0;

      const delay = (ms: number): Promise<void> =>
        sleep(applyJitter(ms, jitterPct));

      // Give the user a moment to refocus the target window.
      await sleep(DEFAULTS.initialDelay);

      let buffer = "";
      const flush = async (): Promise<void> => {
        if (buffer) {
          await keyboard.type(buffer);
          buffer = "";
        }
      };

      for (const char of text) {
        if (this.abortRequested) {
          await flush();
          return;
        }
        if (char === "\r") continue;

        if (char === "\n") {
          await flush();
          await keyboard.type(Key.Enter);
          await delay(charDelay + paragraphDelay);
          continue;
        }

        if (typoChance > 0 && Math.random() < typoChance) {
          const wrong = adjacentKey(char);
          if (wrong) {
            await flush();
            await keyboard.type(wrong);
            await delay(DEFAULTS.typoCorrectionMs);
            if (this.abortRequested) return;
            await keyboard.type(Key.Backspace);
            await delay(charDelay * 2);
            if (this.abortRequested) return;
          }
        }

        buffer += char;
        if (charDelay > 0) {
          await flush();
          await delay(charDelay);
        }
        if (char === " ") {
          await flush();
          await delay(wordDelay);
        }
      }
      await flush();
    } finally {
      this.isTyping = false;
      this.abortRequested = false;

      if (this.queuedRun) {
        this.queuedRun = false;
        const fresh = await action.getSettings<S>();
        void this.runTyping(action, fresh, null);
      }
    }
  }
}
