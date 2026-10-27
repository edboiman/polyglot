import { COURSES, LANGS, conceptLabel, index } from '../../data/courses';
import { MASTERY_RULES, allSkills, langTotals, lastNDays, retention, weaknesses, weeklyAccuracy } from '../../engine/analytics';
import { SKILL_LABEL } from '../../engine/model';
import { BADGES } from '../badges';
import { Meter } from '../components/common';
import { go } from '../router';
import { useStore } from '../store';
import { LangSwitcher } from './Home';

const LEVEL_LABEL = { 'not-started': 'Not started', developing: 'Developing', proficient: 'Proficient', mastered: 'Mastered' };
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export function ProgressScreen() {
  const { state } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const now = Date.now();
  const course = COURSES[lang];
  const tot = langTotals(p);
  const ret = retention(p, now);
  const skills = allSkills(p);
  const weeks = weeklyAccuracy(p, now, 8);
  const days = lastNDays(state, now, 28);
  const weak = weaknesses(p, now);
  const lessons = index(lang).lessons;
  const maxXp = Math.max(1, ...days.map((d) => d.xp));
  const strong = skills.filter((s) => s.recentAccuracy !== null && s.attempts >= 10).sort((a, b) => (b.recentAccuracy ?? 0) - (a.recentAccuracy ?? 0));

  return (
    <div className="screen">
      <header className="screen-head"><h1>Progress</h1></header>
      <LangSwitcher />

      <section className="stats-grid" aria-label={`${course.name} totals`}>
        <div><strong>{Math.round(tot.seconds / 60)}</strong><span>minutes studied</span></div>
        <div><strong>{tot.lessons}/{lessons.length}</strong><span>lessons completed</span></div>
        <div><strong>{tot.reviews}</strong><span>scheduled reviews done</span></div>
        <div><strong>{tot.vocab}</strong><span>words &amp; phrases encountered</span></div>
      </section>

      <section className="panel">
        <h2>Memory</h2>
        <div className="two">
          <div>
            <p className="big-num">{pct(ret.estimated)}</p>
            <p className="small"><strong>Estimated retention</strong> — what the memory model predicts you would recall right now, averaged over {ret.studiedItems} studied items. A model estimate, not a test.</p>
          </div>
          <div>
            <p className="big-num">{pct(ret.observed)}</p>
            <p className="small"><strong>Observed recall</strong> — share of scheduled reviews you actually got right in the last 30 days ({ret.observedCount} reviews).</p>
          </div>
        </div>
        <p className="muted small">{ret.counts.learning} learning · {ret.counts.young} recently learned · {ret.counts.mature} long-term (interval of 21+ days)</p>
      </section>

      <section className="panel">
        <h2>Recall accuracy by week</h2>
        <p className="muted small">Observed accuracy on all reviews, last 8 weeks.</p>
        <div className="weeks" aria-label="Weekly accuracy">
          {weeks.map((w) => (
            <div key={w.label} className="wk" title={w.n ? `${pct(w.accuracy)} of ${w.n}` : 'No reviews'}>
              <div className="wk-bar" style={{ height: `${(w.accuracy ?? 0) * 100}%` }} data-empty={w.n === 0 || undefined} />
              <span className="wk-v">{w.n ? pct(w.accuracy) : '·'}</span>
              <span className="wk-l">{w.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Demonstrated skills</h2>
        <p className="muted small">
          Based on automatically checked answers. Proficient: {MASTERY_RULES.proficient.attempts}+ answers, {MASTERY_RULES.proficient.accuracy * 100}% recent accuracy, {MASTERY_RULES.proficient.days}+ days. Mastered: {MASTERY_RULES.mastered.attempts}+ answers, {MASTERY_RULES.mastered.accuracy * 100}%, {MASTERY_RULES.mastered.days}+ days. These describe the material studied so far.
        </p>
        <ul className="skills">
          {skills.map((s) => (
            <li key={s.skill}>
              <div className="skill-row">
                <span>{SKILL_LABEL[s.skill]}</span>
                <span className={`lvl lvl-${s.level}`}>{LEVEL_LABEL[s.level]}</span>
              </div>
              <Meter value={s.recentAccuracy ?? 0} label={`${SKILL_LABEL[s.skill]} recent accuracy`} />
              <span className="muted small">{s.attempts} answers · recent accuracy {pct(s.recentAccuracy)}{s.skill === 'speaking' ? ' · only recogniser-checked answers count' : ''}</span>
            </li>
          ))}
        </ul>
        {strong.length >= 2 && (
          <p className="small">Strongest: {SKILL_LABEL[strong[0].skill]}. Needs most work: {SKILL_LABEL[strong[strong.length - 1].skill]}.</p>
        )}
      </section>

      {weak.length > 0 && (
        <section className="panel">
          <h2>Grammar to work on</h2>
          <ul className="list plain">
            {weak.map((w) => (
              <li key={w.concept}>
                <strong>{conceptLabel(lang, w.concept)}</strong> — {w.errors} mistakes in 14 days
                {w.lastExample && <span className="muted small"> (e.g. “{w.lastExample.got}” → <span className="target">“{w.lastExample.want}”</span>)</span>}
              </li>
            ))}
          </ul>
          <button className="link" onClick={() => go('practice')}>Practise in the Grammar workshop</button>
        </section>
      )}

      <section className="panel">
        <h2>CEFR A1 course</h2>
        <p className="small">{tot.lessons} of {lessons.length} A1 lessons completed.</p>
        <Meter value={tot.lessons / lessons.length} label="A1 lessons completed" />
        <p className="muted small">Completing lessons shows course coverage. It is not a CEFR certificate — an official exam (e.g. DELE, Goethe-Zertifikat, DELF) is the way to prove a level.</p>
      </section>

      <section className="panel">
        <h2>Activity, last 4 weeks</h2>
        <div className="heat" aria-label="Daily activity">
          {days.map((d) => (
            <span key={d.key} className="heat-cell" style={{ opacity: d.xp ? 0.25 + 0.75 * (d.xp / maxXp) : 1 }} data-on={d.xp > 0 || undefined} title={`${d.date.toLocaleDateString()}: ${d.xp} XP, ${Math.round(d.seconds / 60)} min`} />
          ))}
        </div>
        <p className="muted small">All languages combined.</p>
      </section>

      <section className="panel">
        <h2>All languages</h2>
        <ul className="list plain">
          {LANGS.map((l) => {
            const t = langTotals(state.langs[l]);
            return <li key={l}><strong>{COURSES[l].name}</strong>: {t.lessons} lessons, {t.vocab} items, {Math.round(t.seconds / 60)} min</li>;
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>Milestones</h2>
        <ul className="badges">
          {BADGES.map((b) => (
            <li key={b.id} className={state.badges[b.id] ? 'got' : ''}>
              <span className="badge-mark" aria-hidden>{state.badges[b.id] ? '★' : '☆'}</span>
              <span><strong>{b.title}</strong><span className="muted small">{b.description}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
