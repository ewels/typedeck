import { action } from "@elgato/streamdeck";
import {
  BaseTypeAction,
  type BaseTypingSettings,
  DEFAULTS,
  type PickResult,
  toNumber,
} from "./base";

type TypeSettings = BaseTypingSettings & {
  longPressEnabled?: boolean;
  longPressText?: string;
  longPressThresholdMs?: number | string;
};

@action({ UUID: "com.ewels.type-deck.type" })
export class TypeAction extends BaseTypeAction<TypeSettings> {
  protected override pickText(
    settings: TypeSettings,
  ): PickResult<TypeSettings> {
    return { text: settings.text ?? "" };
  }

  protected override pickLongPressText(settings: TypeSettings): string | null {
    if (!settings.longPressEnabled) return null;
    const t = settings.longPressText ?? "";
    return t === "" ? null : t;
  }

  protected override longPressThreshold(settings: TypeSettings): number {
    return toNumber(
      settings.longPressThresholdMs,
      DEFAULTS.longPressThresholdMs,
    );
  }
}
