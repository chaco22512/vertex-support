import type { JSX } from 'preact';
import type { State } from '../state/flow';
import type { Messages } from '../i18n';
import { Bubble, TypingIndicator } from './pieces';
import { Composer } from './Composer';
import { EscalationCard } from './EscalationCard';

export interface ChatHandlers {
  send: (body: string) => void;
  submitContact: (contact: { email?: string; whatsapp?: string }) => void;
  feedbackSolved: () => void;
  stillNeedHelp: () => void;
  openComposer: () => void;
  newQuestion: () => void;
  retry: () => void;
}

export function Chat(props: { state: State; t: Messages; handlers: ChatHandlers }): JSX.Element {
  const { state, t, handlers } = props;
  const lang = state.language ?? 'en';

  return (
    <>
      <div class="scroll">
        <div class="messages">
          {state.messages.map((m) => (
            <Bubble key={m.key} message={m} answeredByAiLabel={t.ui.answeredByAi} lang={lang} />
          ))}
          {state.awaitingAi && <TypingIndicator label={t.ui.thinking} />}
        </div>

        {state.chips.length > 0 && (
          <div class="chips">
            {state.chips.map((q) => (
              <button key={q} class="chip" lang={lang} onClick={() => handlers.send(q)}>
                {q}
              </button>
            ))}
            <button class="chip" lang={lang} onClick={handlers.openComposer}>
              {t.ui.somethingElse}
            </button>
          </div>
        )}

        {state.showFeedback && (
          <div class="feedback">
            <button class="btn btn--primary" onClick={handlers.feedbackSolved}>
              {t.ui.solved}
            </button>
            <button class="btn btn--ghost" onClick={handlers.stillNeedHelp}>
              {t.ui.stillNeedHelp}
            </button>
          </div>
        )}

        {state.showEscalation && <EscalationCard ui={t.ui} onSubmit={handlers.submitContact} />}

        {state.error && (
          <div class="error-note" role="alert">
            {t.ui.errorGeneric}
            <button class="btn btn--ghost" onClick={handlers.retry}>
              {t.ui.retry}
            </button>
          </div>
        )}

        {state.resolved && (
          <div class="feedback">
            <button class="btn btn--primary" onClick={handlers.newQuestion}>
              {t.ui.newQuestion}
            </button>
          </div>
        )}
      </div>

      {state.showComposer && !state.resolved && (
        <Composer
          placeholder={state.behavior === 'free_text' ? t.ui.othersPrompt : t.ui.inputPlaceholder}
          sendLabel={t.ui.send}
          disabled={state.awaitingAi}
          onSend={handlers.send}
        />
      )}
    </>
  );
}
