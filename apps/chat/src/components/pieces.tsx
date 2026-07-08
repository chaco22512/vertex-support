import type { JSX } from 'preact';
import type { ChatMessage } from '../state/flow';

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Render text, turning URLs into link cards (§6.2). */
function Linkified(props: { text: string }): JSX.Element {
  const parts = props.text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a class="linkcard" href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function Bubble(props: {
  message: ChatMessage;
  answeredByAiLabel: string;
  lang: string;
  time?: string;
}): JSX.Element | null {
  const { message } = props;
  if (message.sender === 'system') {
    if (!message.body) return null; // hidden internal marker
    return (
      <div class="msg msg--system" lang={props.lang}>
        {message.body}
      </div>
    );
  }
  const isBot = message.sender === 'ai' || message.sender === 'staff';
  return (
    <div class={`msg msg--${message.sender}`} lang={props.lang}>
      {message.sender === 'ai' && (
        <div class="msg__by">
          <span class="msg__by-dot" aria-hidden="true" />
          {props.answeredByAiLabel}
        </div>
      )}
      <div>{isBot ? <Linkified text={message.body} /> : message.body}</div>
      {props.time && !message.pending ? <div class="msg__time">{props.time}</div> : null}
    </div>
  );
}

export function TypingIndicator(props: { label: string }): JSX.Element {
  return (
    <div class="typing" role="status" aria-label={props.label}>
      <span />
      <span />
      <span />
    </div>
  );
}
