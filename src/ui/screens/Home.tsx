import { COURSES, LANGS, conceptLabel, index } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { forecast, reviewBudget, streak, totalForDay } from '../../engine/analytics';
import { dayKey } from '../../engine/model';
import { type Recommendation, recommend } from '../../engine/recommend';
import { weeklyChallenge } from '../badges';
import { Meter } from '../components/common';
import { IconFlame } from '../components/icons';
import { go } from '../router';
import { useStore } from '../store';

export function LangSwitcher() {
  const { state, update } = useStore();
  return (
    <div className="lang-switch" role="radiogroup" aria-label="Language you are learning">
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={state.currentLang === l}
          className={`lang-pill lp-${l}${state.currentLang === l ? ' on' : ''}`}
          onClick={() => update((s) => ({ ...s, currentLang: l }))}
        >
          {COURSES[l].nativeName}
        </button>
      ))}
    </div>
  );
}

function recLabel(lang: LangCode, r: Recommendation): { title: string; action: string; path: string } {
  const idx = index(lang);
  switch (r.kind) {
    case 'resume': {
      const l = idx.lessonById.get(r.lessonId)!;
      return { title: `Finish “${l.title}”`, action: 'Continue learning', path: `lesson/${l.id}` };
    }
    case 'lesson': {
      const l = idx.lessonById.get(r.lessonId)!;
      return { title: `Unit ${l.unit}: ${l.title}`, action: 'Continue learning', path: `lesson/${l.id}` };
    }
    case 'review':
      return { title: `Review ${r.due} item${r.due === 1 ? '' : 's'}`, action: 'Start review', path: 'review/due' };
    case 'grammar':
      return { title: conceptLabel(lang, r.concept), action: 'Practise this', path: `grammar/${r.topicId}` };
    case 'story':
      return { title: idx.storyById.get(r.storyId)!.title, action: 'Read the story', path: `story/${r.storyId}` };
    case 'conversation':
      return { title: idx.conversationById.get(r.conversationId)!.title, action: 'Start conversation', path: `conversation/${r.conversationId}` };
    default:
      return { title: 'All caught up', action: 'Browse practice', path: 'practice' };
  }
}

export function Home() {
  const { state } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const now = Date.now();
  const course = COURSES[lang];
  const rec = recommend(lang, p, state.settings, now);
  const label = recLabel(lang, rec);
  const budget = reviewBudget(p, state.settings.maxReviewsPerDay, now);
  const due = budget.available;
  const fc = forecast(p, now, 7);
  const today = totalForDay(state, dayKey(now));
  const goal = state.settings.dailyGoalXp;
  const st = streak(state, now);
  const ch = weeklyChallenge(state, now);
  const lessons = index(lang).lessons;
  const done = lessons.filter((l) => p.lessons[l.id]?.completedAt).length;
  const unitNow = lessons.find((l) => !p.lessons[l.id]?.completedAt)?.unit ?? course.units.length;
  const maxFc = Math.max(1, ...fc);

  return (
    <div className="screen home">
      <header className="home-head">
        <LangSwitcher />
      </header>

      <section className="plan">
        <p className="plan-for">Today in {course.name}</p>
        <h1 className="display plan-title">{label.title}</h1>
        <p className="plan-why">{rec.reason}</p>
        <button className="btn primary wide big" onClick={() => go(label.path)}>{label.action}</button>
        {rec.kind !== 'review' && due > 0 && (
          <button className="btn ghost wide" onClick={() => go('review/due')}>Review {due} due item{due === 1 ? '' : 's'} instead</button>
        )}
      </section>

      <section className="panel goal">
        <div className="goal-row">
          <div>
            <h2>Daily goal</h2>
            <p className="muted small">{Math.min(today.xp, goal)} of {goal} XP{today.seconds ? ` · ${Math.round(today.seconds / 60)} min studied` : ''}</p>
          </div>
          {state.settings.streaks && st.days > 0 && (
            <span className={`streak${st.activeToday ? ' lit' : ''}`} title="Days in a row with practice. One missed day per week is forgiven automatically.">
              <IconFlame size={18} /> {st.days} day{st.days === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <Meter value={today.xp / goal} label="Daily goal progress" />
      </section>

      <section className="panel">
        <h2>Review workload</h2>
        <p className="muted small">
          {budget.due === 0 ? 'Nothing due right now.' : budget.remaining === 0 ? `${budget.due} due, but you've reached today's limit of ${state.settings.maxReviewsPerDay}. They'll wait until tomorrow.` : `${due} due now${budget.due > due ? ` (${budget.due} in total; today's limit applies)` : ''}.`} Next 7 days:
        </p>
        <div className="forecast" aria-label="Reviews due over the next seven days">
          {fc.map((n, i) => (
            <div key={i} className="fc-col" title={`${n} reviews`}>
              <div className="fc-bar" style={{ height: `${(n / maxFc) * 100}%` }} />
              <span className="fc-n">{n}</span>
              <span className="fc-d">{i === 0 ? 'Today' : new Date(now + i * 86_400_000).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Course progress</h2>
        <p className="muted small">Unit {unitNow} of {course.units.length} · {done} of {lessons.length} lessons completed</p>
        <Meter value={done / lessons.length} label="Lessons completed" />
        <button className="link" onClick={() => go('learn')}>See all units</button>
      </section>

      <section className="panel">
        <h2>This week</h2>
        <p className="small">{ch.title}</p>
        <Meter value={ch.value / ch.goal} label="Weekly challenge" />
        <p className="muted small">{Math.min(ch.value, ch.goal)} / {ch.goal}</p>
      </section>
    </div>
  );
}
