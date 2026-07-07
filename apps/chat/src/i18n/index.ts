import type { LanguageCode } from '@vertex/shared';
import { SUPPORTED_LANGUAGES, type Messages } from './messages';
import { en } from './en';
import { id } from './id';
import { tl } from './tl';
import { ne } from './ne';
import { vi } from './vi';

const LOCALES: Record<LanguageCode, Messages> = { en, id, tl, ne, vi };

export function getMessages(lang: LanguageCode): Messages {
  return LOCALES[lang] ?? en;
}

export function isSupported(lang: string): lang is LanguageCode {
  return (SUPPORTED_LANGUAGES as string[]).includes(lang);
}

/**
 * Detect the best-matching supported language from a browser locale string
 * (e.g. "fil-PH" -> tl, "ne-NP" -> ne). Falls back to 'en'.
 */
export function detectLanguage(navigatorLanguage: string | undefined): LanguageCode {
  if (!navigatorLanguage) return 'en';
  const primary = navigatorLanguage.toLowerCase().split('-')[0] ?? '';
  if (primary === 'fil') return 'tl'; // Filipino maps to Tagalog
  if (isSupported(primary)) return primary;
  return 'en';
}

/** Supported languages ordered with the detected one first (§6.1). */
export function languageOrder(detected: LanguageCode): LanguageCode[] {
  return [detected, ...SUPPORTED_LANGUAGES.filter((l) => l !== detected)];
}

export { SUPPORTED_LANGUAGES, LANGUAGE_NATIVE_NAMES } from './messages';
export type { Messages, UiStrings } from './messages';
