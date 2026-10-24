import type { LanguageCode } from '@vertex/shared';

export interface UiStrings {
  languagePrompt: string;
  categoryPrompt: string;
  somethingElse: string;
  changeTopic: string;
  /** ★v1.8: always-visible switch to another topic, same conversation. */
  askAnother: string;
  /** ★v1.8: AI handed a follow-up to staff in an open case (no contact cards). */
  addedToOpenRequest: string;
  /** ★v1.8: leave the topic picker and return to the conversation. */
  backToChat: string;
  othersPrompt: string;
  plansMessage: string;
  inputPlaceholder: string;
  send: string;
  solved: string;
  stillNeedHelp: string;
  answeredByAi: string;
  newQuestion: string;
  escalationTitle: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  whatsappPlaceholder: string;
  contactSend: string;
  contactValidation: string;
  /** Pre-escalation intake card (§6.2 v1.6). */
  intakeTitle: string;
  intakeSkip: string;
  intakeContinue: string;
  fieldCustomerNumber: string;
  fieldSmartpit: string;
  fieldRegisteredPhone: string;
  fieldSimIccid: string;
  fieldDeviceModel: string;
  fieldTriedAlready: string;
  fieldGmo: string;
  sentTitle: string;
  sentTitleNamed: string;
  sentWithin24: string;
  sentEmailNote: string;
  sentWhatsappNote: string;
  today: string;
  yesterday: string;
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
