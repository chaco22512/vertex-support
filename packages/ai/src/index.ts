export type { AiCallPurpose, LlmClient, LlmMessage, LlmGenerateRequest } from './llm';
export { maskPii, type MaskResult } from './pii';
export {
  resolveKbCategories,
  resolveTopicLabel,
  resolveIdPrefixes,
  canonicalTopic,
  idHasCode,
  withTopicCodes,
  GENERAL_CATEGORY,
  type TopicCodeLink,
  type MenuCategory,
  type MenuCategories,
} from './categories';
export { fetchScopedRules } from './rules';
export {
  rankRules,
  buildRetrievalQuery,
  tokenize,
  FALLBACK_TOP_K,
  type RankedRule,
} from './retrieve';
export {
  buildSystemPrompt,
  buildLlmMessages,
  formatRule,
  type HistoryMessage,
  type SystemPromptOptions,
  type PromptBehaviour,
  SYSTEM_TEXT,
  SAFETY_RULES_TEXT,
  DEFAULT_COMMON_BEHAVIOUR,
} from './prompt';
export { parseAiResponse, aiResponseSchema, ESCALATION_REASONS, type AiResponse } from './parse';
export {
  busyEscalationMessage,
  BUSY_ESCALATION_MESSAGE,
  fallbackEscalationMessage,
  FALLBACK_ESCALATION_MESSAGE,
} from './locales';
export { runAiReply, type RunAiReplyInput, type AiReplyResult } from './pipeline';
export { GeminiClient, GeminiError, DEFAULT_GEMINI_MODEL, type GeminiConfig } from './gemini';
export { translateToEnglish, translateManyToEnglish, draftStaffReply } from './admin';
export {
  SAFETY_TESTS,
  evaluateSafety,
  type SafetyTestCase,
  type SafetyRun,
  type SafetyCheck,
  type SafetyReport,
  type SafetyContext,
} from './safety';
