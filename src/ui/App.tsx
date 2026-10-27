import { useEffect } from 'react';
import { COURSES } from '../data/courses';
import { IconHome, IconLearn, IconPractice, IconProfile, IconProgress } from './components/icons';
import { go, useRoute } from './router';
import { RecoveryScreen } from './Recovery';
import { useStore } from './store';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Practice } from './screens/Practice';
import { ProgressScreen } from './screens/Progress';
import { Profile } from './screens/Profile';
import { LessonScreen } from './screens/Lesson';
import { ReviewScreen } from './screens/Review';
import { ListeningLab } from './screens/Listening';
import { GrammarScreen } from './screens/Grammar';
import { StoryScreen } from './screens/Story';
import { ConversationScreen } from './screens/Conversation';
import { Onboarding } from './screens/Onboarding';

const TABS = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'learn', label: 'Learn', Icon: IconLearn },
  { id: 'practice', label: 'Practice', Icon: IconPractice },
  { id: 'progress', label: 'Progress', Icon: IconProgress },
  { id: 'profile', label: 'Profile', Icon: IconProfile },
];

export function App() {
  const { state, status, dropped } = useStore();
  const route = useRoute();
  const [page, a, b] = route;
  const s = state.settings;

  useEffect(() => {
    const root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.theme);
    root.style.setProperty('--scale', String(s.fontScale));
    root.classList.toggle('reduce-motion', s.reduceMotion);
    root.lang = 'en';
    document.title = `Polyglot · ${COURSES[state.currentLang].name}`;
  }, [s.theme, s.fontScale, s.reduceMotion, state.currentLang]);

  if (status.kind === 'recovery') return <RecoveryScreen reason={status.reason} />;
  if (!s.onboarded && page !== 'profile') return <Onboarding />;

  let content;
  let fullscreen = true;
  switch (page) {
    case 'lesson': content = <LessonScreen lessonId={a} />; break;
    case 'review': content = <ReviewScreen mode={a} concept={b} />; break;
    case 'listening': content = <ListeningLab />; break;
    case 'grammar': content = <GrammarScreen topicId={a} />; break;
    case 'story': content = <StoryScreen storyId={a} />; break;
    case 'conversation': content = <ConversationScreen conversationId={a} />; break;
    default:
      fullscreen = false;
      content =
        page === 'learn' ? <Learn /> :
        page === 'practice' ? <Practice /> :
        page === 'progress' ? <ProgressScreen /> :
        page === 'profile' ? <Profile /> : <Home />;
  }

  const active = TABS.some((t) => t.id === page) ? page : 'home';
  return (
    <div className={`app lang-${state.currentLang}`}>
      {status.kind === 'conflict' && (
        <div className="banner" role="alert">
          Polyglot saved newer progress in another tab, so this tab has stopped saving.{' '}
          <button className="link" onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      {status.kind === 'readonly' && (
        <div className="banner" role="alert">This progress was saved by a newer version of Polyglot. Changes made here won't be saved — reload to get the update.</div>
      )}
      {status.kind === 'save-error' && (
        <div className="banner" role="alert">Progress could not be saved on this device. Export a backup from Profile to be safe.</div>
      )}
      {dropped > 0 && page === 'home' && (
        <div className="banner" role="status">{dropped} saved review item{dropped === 1 ? ' was' : 's were'} skipped because the course content changed.</div>
      )}
      <div className={fullscreen ? 'full' : 'tabbed'}>{content}</div>
      {!fullscreen && (
        <nav className="tabbar" aria-label="Main">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={`tab${active === id ? ' on' : ''}`} onClick={() => go(id)} aria-current={active === id ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
