/** Provider-agnostic LLM contract so the pipeline can be unit-tested with a mock. */

export interface LlmMessage {
  /** 'user' = customer, 'model' = assistant/previous replies. */
  role: 'user' | 'model';
  text: string;
}

export interface LlmGenerateRequest {
  system: string;
  messages: LlmMessage[];
  temperature?: number;
  /** Optional abort signal so callers can enforce a timeout (§6.3, 15s). */
  signal?: AbortSignal;
  /** Force JSON output. Defaults to true (the chat pipeline). Set false for
   *  plain-text uses like translation / staff-reply drafts (§7.3). */
  json?: boolean;
}

export interface LlmClient {
  /** Model identifier, recorded into messages.ai_meta.model (§4.3). */
  readonly model: string;
  generate(req: LlmGenerateRequest): Promise<string>;
}
