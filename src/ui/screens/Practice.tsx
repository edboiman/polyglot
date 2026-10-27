import { COURSES, conceptLabel } from '../../data/courses';
import { difficultCards, reviewBudget, weaknesses } from '../../engine/analytics';
import { contentUnlocked, selectReviewCards } from '../../engine/session';
import { IconBook, IconCards, IconChat, IconChevron, IconEar, IconLock, IconPuzzle } from '../components/icons';
import { go } from '../router';
import { useStore } from '../store';
import { LangSwitcher } from './Home';

function Row({ title, sub, onClick, locked, badge }: { title: string; sub: string; onClick: () => void; locked?: string | false; badge?: string }) {
  return (
    <li>
      <button className="list-row" onClick={onClick} aria-disabled={!!locked} title={locked || undefined}>
        <span className="list-text">
          <span className="list-title">{title}</span>
          <span className="muted small">{locked || sub}</span>
        </span>
        {badge && <span className="count">{badge}</span>}
        {locked ? <IconLock size={16} /> : <IconChevron size={18} />}
      </button>
    </li>
  );
}

export function Practice() {
  const { state } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const course = COURSES[lang];
  const now = Date.now();
  const free = state.settings.freeNavigation;
  const budget = reviewBudget(p, state.settings.maxReviewsPerDay, now);
  const due = budget.due;
  const capped = budget.available;
  const difficult = difficultCards(p).length;
  const missed = selectReviewCards(lang, p, { mode: 'missed', limit: 999, now }).length;
  const saved = selectReviewCards(lang, p, { mode: 'saved', limit: 999, now }).length;
  const grammarCards = selectReviewCards(lang, p, { mode: 'grammar', limit: 999, now }).length;
  const weak = weaknesses(p, now);
  const lockMsg = (after: string) => {
    const l = course.units.flatMap((u) => u.lessons).find((x) => x.id === after);
    return l ? `Unlocks after “${l.title}” (unit ${l.unit})` : 'Locked';
  };
  const studied = Object.keys(p.cards).length > 0;

  return (
    <div className="screen">
      <header className="screen-head"><h1>Practice</h1></header>
      <LangSwitcher />

      <section className="hub">
        <h2><IconCards size={20} /> Smart review</h2>
        <p className="muted small">
          {due ? (capped ? `${capped} to review now${due > capped ? ` (${due} due; today's limit is ${state.settings.maxReviewsPerDay})` : ''} · about ${Math.max(1, Math.round(capped * 0.25))} min` : `${due} due, but today's limit of ${state.settings.maxReviewsPerDay} is reached.`) : studied ? 'Nothing is due — items return when you are about to forget them.' : 'Words you study in lessons appear here when they are due.'}
        </p>
        <ul className="list">
          <Row title="Due reviews" sub="Scheduled by your memory model" badge={capped ? String(capped) : undefined} onClick={() => go('review/due')} locked={!capped && (due ? 'Daily review limit reached' : 'Nothing due right now')} />
          <Row title="Difficult words" sub="Items you have forgotten before" badge={difficult ? String(difficult) : undefined} onClick={() => go('review/difficult')} locked={!difficult && 'None yet'} />
          <Row title="Recently missed" sub="Mistakes from the last 7 days" badge={missed ? String(missed) : undefined} onClick={() => go('review/missed')} locked={!missed && 'No recent mistakes'} />
          <Row title="Saved words" sub="Words you added from stories" badge={saved ? String(saved) : undefined} onClick={() => go('review/saved')} locked={!saved && 'Tap words in stories to save them'} />
          <Row title="Grammar review" sub="Sentence patterns, weakest first" badge={grammarCards ? String(Math.min(grammarCards, 15)) : undefined} onClick={() => go('review/grammar')} locked={!grammarCards && 'Complete a lesson first'} />
        </ul>
        {weak.length > 0 && (
          <p className="small">Focus suggestion: <strong>{conceptLabel(lang, weak[0].concept)}</strong> ({weak[0].errors} recent mistakes).</p>
        )}
      </section>

      <section className="hub">
        <h2><IconChat size={20} /> Conversations</h2>
        <ul className="list">
          {course.conversations.map((c) => {
            const open = contentUnlocked(lang, c.unlockAfter, p, free);
            return <Row key={c.id} title={c.title} sub={`${c.situation}${p.conversationsDone[c.id] ? ' · done' : ''}`} onClick={() => open && go(`conversation/${c.id}`)} locked={!open && lockMsg(c.unlockAfter)} />;
          })}
        </ul>
      </section>

      <section className="hub">
        <h2><IconEar size={20} /> Listening lab</h2>
        <ul className="list">
          <Row title="Listening practice" sub="Words, sentences and dialogues from lessons you have done" onClick={() => go('listening')} locked={!studied && 'Complete a lesson first'} />
        </ul>
      </section>

      <section className="hub">
        <h2><IconPuzzle size={20} /> Grammar workshop</h2>
        <ul className="list">
          {course.grammar.map((g) => {
            const open = contentUnlocked(lang, g.unlockAfter, p, free);
            const best = p.grammarDone[g.id]?.best;
            const isWeak = weak.some((w) => g.concepts.includes(w.concept));
            return <Row key={g.id} title={g.title} sub={`${g.summary.slice(0, 70)}${g.summary.length > 70 ? '…' : ''}${best !== undefined ? ` · best ${Math.round(best * 100)}%` : ''}`} badge={isWeak ? 'Focus' : undefined} onClick={() => open && go(`grammar/${g.id}`)} locked={!open && lockMsg(g.unlockAfter)} />;
          })}
        </ul>
      </section>

      <section className="hub">
        <h2><IconBook size={20} /> Reading & stories</h2>
        <ul className="list">
          {course.stories.map((st) => {
            const open = contentUnlocked(lang, st.unlockAfter, p, free);
            const r = p.storiesRead[st.id];
            return <Row key={st.id} title={st.title} sub={`${st.level}${r ? ` · ${Math.round(r.score * 100)}% on questions` : ''}`} onClick={() => open && go(`story/${st.id}`)} locked={!open && lockMsg(st.unlockAfter)} />;
          })}
        </ul>
      </section>
    </div>
  );
}
