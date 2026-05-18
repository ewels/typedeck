import { action } from "@elgato/streamdeck";
import {
  BaseTypeAction,
  type BaseTypingSettings,
  type PickResult,
  splitLines,
  toNumber,
} from "./base";

type CycleSettings = BaseTypingSettings & {
  cycleIndex?: number;
};

@action({ UUID: "com.ewels.type-deck.cycle" })
export class CycleAction extends BaseTypeAction<CycleSettings> {
  protected override pickText(
    settings: CycleSettings,
  ): PickResult<CycleSettings> {
    const lines = splitLines(settings.text ?? "");
    if (lines.length === 0) return null;
    const idx = toNumber(settings.cycleIndex, 0) % lines.length;
    return {
      text: lines[idx],
      update: { cycleIndex: (idx + 1) % lines.length },
    };
  }
}
