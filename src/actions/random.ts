import { action } from "@elgato/streamdeck";
import {
  BaseTypeAction,
  type BaseTypingSettings,
  type PickResult,
  splitLines,
} from "./base";

type RandomSettings = BaseTypingSettings;

@action({ UUID: "com.ewels.type-deck.random" })
export class RandomPickAction extends BaseTypeAction<RandomSettings> {
  protected override pickText(
    settings: RandomSettings,
  ): PickResult<RandomSettings> {
    const lines = splitLines(settings.text ?? "");
    if (lines.length === 0) return null;
    return { text: lines[Math.floor(Math.random() * lines.length)] };
  }
}
