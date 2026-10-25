export type { LlmClient, LlmMessage, LlmGenerateRequest } from './llm';
export { maskPii, type MaskResult } from './pii';
export {
  resolveKbCategories,
  resolveTopicLabel,
  GENERAL_CATEGORY,
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
export { fallbackEscalationMessage, FALLBACK_ESCALATION_MESSAGE } from './locales';
export { runAiReply, type RunAiReplyInput, type AiReplyResult } from './pipeline';
export { GeminiClient, GeminiError, DEFAULT_GEMINI_MODEL, type GeminiConfig } from './gemini';
export { translateToEnglish, draftStaffReply } from './admin';
export {
  SAFETY_TESTS,
  evaluateSafety,
  type SafetyTestCase,
  type SafetyRun,
  type SafetyCheck,
  type SafetyReport,
  type SafetyContext,
} from './safety';
