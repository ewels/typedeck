import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

type TypeSettings = {
	text?: string;
	charDelay?: number | string;
	wordDelay?: number | string;
	paragraphDelay?: number | string;
};

const DEFAULTS = {
	charDelay: 40,
	wordDelay: 80,
	paragraphDelay: 400,
	initialDelay: 300,
} as const;

const sleep = (ms: number): Promise<void> =>
	ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

function toNumber(value: unknown, fallback: number): number {
	const n = typeof value === "number" ? value : parseFloat(String(value));
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function previewTitle(text: string | undefined): string {
	const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
	if (!collapsed) return "Type";
	return collapsed.length > 20 ? collapsed.slice(0, 20) + "…" : collapsed;
}

// AppleScript strings are double-quoted; escape backslashes and double quotes
// so the keystroke literal is preserved verbatim.
function appleScriptEscape(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function sendKeystroke(text: string): Promise<void> {
	const script = `tell application "System Events" to keystroke "${appleScriptEscape(text)}"`;
	await run("osascript", ["-e", script]);
}

async function sendReturn(): Promise<void> {
	await run("osascript", ["-e", `tell application "System Events" to key code 36`]);
}

@action({ UUID: "com.ewels.type-deck.type" })
export class FakeType extends SingletonAction<TypeSettings> {
	override onWillAppear(ev: WillAppearEvent<TypeSettings>): Promise<void> {
		return ev.action.setTitle(previewTitle(ev.payload.settings.text));
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<TypeSettings>): Promise<void> {
		return ev.action.setTitle(previewTitle(ev.payload.settings.text));
	}

	override async onKeyDown(ev: KeyDownEvent<TypeSettings>): Promise<void> {
		const { text } = ev.payload.settings;
		if (!text) return;

		const charDelay = toNumber(ev.payload.settings.charDelay, DEFAULTS.charDelay);
		const wordDelay = toNumber(ev.payload.settings.wordDelay, DEFAULTS.wordDelay);
		const paragraphDelay = toNumber(ev.payload.settings.paragraphDelay, DEFAULTS.paragraphDelay);

		// Give the user a moment to focus the target window after the key press.
		await sleep(DEFAULTS.initialDelay);

		for (const char of text) {
			if (char === "\r") continue;
			if (char === "\n") {
				await sendReturn();
				await sleep(charDelay + paragraphDelay);
			} else if (char === " ") {
				await sendKeystroke(" ");
				await sleep(charDelay + wordDelay);
			} else {
				await sendKeystroke(char);
				await sleep(charDelay);
			}
		}
	}
}
