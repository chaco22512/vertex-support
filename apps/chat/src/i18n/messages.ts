import type { LanguageCode } from '@vertex/shared';

export interface UiStrings {
  languagePrompt: string;
  categoryPrompt: string;
  somethingElse: string;
  othersPrompt: string;
  plansMessage: string;
  inputPlaceholder: string;
  send: string;
  solved: string;
  stillNeedHelp: string;
  answeredByAi: string;
  newQuestion: string;
  escalationTitle: string;
  emailPlaceholder: string;
  whatsappPlaceholder: string;
  contactSend: string;
  contactValidation: string;
  offline: string;
  teamReplied: string;
  errorGeneric: string;
  retry: string;
  statusAi: string;
  statusWaitingStaff: string;
  thinking: string;
}

export interface Messages {
  /** UI chrome strings. */
  ui: UiStrings;
  /** Category id -> localized tile label. */
  categories: Record<string, string>;
  /** Category id -> localized preset questions (aligned to menu order). */
  subQuestions: Record<string, string[]>;
}

export const SUPPORTED_LANGUAGES: LanguageCode[] = ['en', 'id', 'tl', 'ne', 'vi'];

/** Native names for the language-selection screen (§6.1). */
export const LANGUAGE_NATIVE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
  tl: 'Tagalog',
  ne: 'नेपाली',
  vi: 'Tiếng Việt',
};
