export const SUPPORTED_LOCALES = ["it", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "it";

export type TranslationNamespace = "common" | "menu" | "pos";

export type TranslationDictionary = Record<string, string | Record<string, string>>;

import itCommon from "./locales/it/common.json" with { type: "json" };
import itMenu from "./locales/it/menu.json" with { type: "json" };
import itPos from "./locales/it/pos.json" with { type: "json" };
import enCommon from "./locales/en/common.json" with { type: "json" };
import enMenu from "./locales/en/menu.json" with { type: "json" };
import enPos from "./locales/en/pos.json" with { type: "json" };

export const resources: Record<
  SupportedLocale,
  Record<TranslationNamespace, TranslationDictionary>
> = {
  it: { common: itCommon, menu: itMenu, pos: itPos },
  en: { common: enCommon, menu: enMenu, pos: enPos },
};

export function t(
  locale: SupportedLocale,
  namespace: TranslationNamespace,
  key: string,
): string {
  const dict = resources[locale][namespace];
  const value = dict[key];
  return typeof value === "string" ? value : key;
}

export function getLocalizedField(
  field: Record<string, string>,
  locale: SupportedLocale,
): string {
  return field[locale] ?? field[DEFAULT_LOCALE] ?? Object.values(field)[0] ?? "";
}
