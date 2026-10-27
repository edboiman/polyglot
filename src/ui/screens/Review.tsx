import { useMemo } from 'react';
import { hasVoice } from '../../audio/speech';
import { reviewBudget } from '../../engine/analytics';
import { type ReviewMode, buildReview, seededRng } from '../../engine/session';
import { Empty, Screen } from '../components/common';
import { SessionRunner } from '../exercises/SessionRunner';
import { go } from '../router';
import { useStore } from '../store';

const TITLES: Record<ReviewMode, string> = {
  due: 'Due reviews',
  difficult: 'Difficult words',
  missed: 'Recently missed',
  grammar: 'Grammar review',
  saved: 'Saved words',
};

export function ReviewScreen({ mode, concept }: { mode: string; concept?: string }) {
  const { state } = useStore();
  const lang = state.currentLang;
  const m = (mode in TITLES ? mode : 'due') as ReviewMode;
  const ex = useMemo(() => {
    const p = state.langs[lang];
    const limit = m === 'due' ? reviewBudget(p, state.settings.maxReviewsPerDay, Date.now()).remaining : m === 'grammar' ? 15 : 30;
    return buildReview(lang, p, { mode: m, limit, audio: hasVoice(lang), typing: state.settings.typing, rng: seededRng(Date.now() % 99991), now: Date.now(), concept });
    // Build once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, m, concept]);

  if (!ex.length) {
    return (
      <Screen title={TITLES[m]} back={() => go('practice')}>
        <Empty title="Nothing to review here right now.">
          <p>Items come back when the memory model predicts you are about to forget them. Learning something new is a good use of this time.</p>
          <button className="btn primary" onClick={() => go('learn')}>Go to lessons</button>
        </Empty>
      </Screen>
    );
  }
  return <SessionRunner lang={lang} exercises={ex} mode="review" title={TITLES[m]} onExit={() => go('practice')} />;
}
