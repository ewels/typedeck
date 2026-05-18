import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { Key, keyboard } from "@nut-tree-fork/nut-js";

// We manage every delay ourselves in code, so disable the library's built-in
// per-keypress wait.
keyboard.config.autoDelayMs = 0;

type TypeSettings = {
  text?: string;
  charDelay?: number | string;
  wordDelay?: number | string;
  paragraphDelay?: number | string;
};

const DEFAULTS = {
  charDelay: 5,
  wordDelay: 40,
  paragraphDelay: 400,
  initialDelay: 300,
} as const;

const sleep = (ms: number): Promise<void> =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function previewTitle(text: string | undefined): string {
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "Type";
  return collapsed.length > 20 ? `${collapsed.slice(0, 20)}…` : collapsed;
}

@action({ UUID: "com.ewels.type-deck.type" })
export class FakeType extends SingletonAction<TypeSettings> {
  override onWillAppear(ev: WillAppearEvent<TypeSettings>): Promise<void> {
    return ev.action.setTitle(previewTitle(ev.payload.settings.text));
  }

  override onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<TypeSettings>,
  ): Promise<void> {
    return ev.action.setTitle(previewTitle(ev.payload.settings.text));
  }

  override async onKeyDown(ev: KeyDownEvent<TypeSettings>): Promise<void> {
    const { text } = ev.payload.settings;
    if (!text) return;

    const charDelay = toNumber(
      ev.payload.settings.charDelay,
      DEFAULTS.charDelay,
    );
    const wordDelay = toNumber(
      ev.payload.settings.wordDelay,
      DEFAULTS.wordDelay,
    );
    const paragraphDelay = toNumber(
      ev.payload.settings.paragraphDelay,
      DEFAULTS.paragraphDelay,
    );

    // Give the user a moment to refocus the target window after the key press.
    await sleep(DEFAULTS.initialDelay);

    // Group runs of chars (including the trailing space/) into a single
    // keyboard.type() call when there is no per-character delay — each call
    // has fixed overhead, so batching dramatically speeds up zero-delay typing.
    let buffer = "";
    const flush = async (): Promise<void> => {
      if (buffer) {
        await keyboard.type(buffer);
        buffer = "";
      }
    };

    for (const char of text) {
      if (char === "\r") continue;
      if (char === "\n") {
        await flush();
        await keyboard.type(Key.Enter);
        await sleep(charDelay + paragraphDelay);
      } else if (char === " ") {
        buffer += " ";
        if (charDelay > 0) {
          await flush();
          await sleep(charDelay);
        }
        await flush();
        await sleep(wordDelay);
      } else {
        buffer += char;
        if (charDelay > 0) {
          await flush();
          await sleep(charDelay);
        }
      }
    }
    await flush();
  }
}
