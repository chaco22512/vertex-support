import type { JSX } from 'preact';
import { useChat } from './state/store';
import { detectLanguage, languageOrder, LANGUAGE_NATIVE_NAMES } from './i18n';
import { Header } from './components/Header';
import { LanguageScreen } from './components/LanguageScreen';
import { CategoryGrid } from './components/CategoryGrid';
import { Chat } from './components/Chat';

export function App(): JSX.Element {
  const chat = useChat();
  const { state, t } = chat;
  const lang = state.language ?? detectLanguage(navigator.language);

  const statusText =
    state.escalated || state.resolved ? t.ui.statusWaitingStaff : t.ui.statusAi;

  return (
    <div class="app">
      <Header
        statusText={statusText}
        languageLabel={LANGUAGE_NATIVE_NAMES[lang]}
        onChangeLanguage={chat.changeLanguage}
      />

      {state.offline && (
        <div class="banner banner--offline" role="status">
          {t.ui.offline}
        </div>
      )}
      {state.teamReplied && (
        <div class="banner banner--replied" role="status">
          {t.ui.teamReplied}
        </div>
      )}

      {state.view === 'language' && (
        <LanguageScreen
          prompt={t.ui.languagePrompt}
          order={languageOrder(detectLanguage(navigator.language))}
          onSelect={chat.selectLanguage}
        />
      )}

      {state.view === 'category' && (
        <CategoryGrid
          prompt={t.ui.categoryPrompt}
          categories={chat.categories}
          lang={lang}
          onSelect={chat.selectCategory}
        />
      )}

      {state.view === 'chat' && (
        <Chat
          state={state}
          t={t}
          handlers={{
            send: chat.send,
            submitContact: chat.submitContact,
            feedbackSolved: chat.feedbackSolved,
            stillNeedHelp: chat.stillNeedHelp,
            openComposer: chat.openComposer,
            changeTopic: chat.changeTopic,
            newQuestion: chat.newQuestion,
            retry: chat.retry,
          }}
        />
      )}
    </div>
  );
}
