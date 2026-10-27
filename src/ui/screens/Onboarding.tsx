import { useState } from 'react';
import { COURSES, LANGS } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { go } from '../router';
import { useStore } from '../store';

export function Onboarding() {
  const { update } = useStore();
  const [lang, setLang] = useState<LangCode>('es');
  const [goal, setGoal] = useState(50);
  const finish = () => {
    update((s) => ({ ...s, currentLang: lang, settings: { ...s.settings, dailyGoalXp: goal, newPerDay: goal <= 20 ? 5 : goal >= 100 ? 15 : 10, onboarded: true } }));
    go('home');
  };
  return (
    <div className="onboard">
      <h1 className="display brand">Polyglot</h1>
      <p className="lead">Learn Spanish, German or French with short daily sessions built on how memory works: recall from memory, spaced reviews, and real sentences.</p>
      <fieldset>
        <legend>What would you like to learn?</legend>
        <div className="lang-cards">
          {LANGS.map((l) => (
            <label key={l} className={`lang-card lc-${l}${lang === l ? ' on' : ''}`}>
              <input type="radio" name="lang" value={l} checked={lang === l} onChange={() => setLang(l)} />
              <span className="lc-native" lang={l}>{COURSES[l].nativeName}</span>
              <span className="muted small">{COURSES[l].name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>How much time per day?</legend>
        <div className="goal-opts">
          {[
            [20, '5 min', 'Light'],
            [50, '10–15 min', 'Regular'],
            [100, '25 min', 'Serious'],
          ].map(([v, t, n]) => (
            <label key={v} className={`goal-opt${goal === v ? ' on' : ''}`}>
              <input type="radio" name="goal" checked={goal === v} onChange={() => setGoal(v as number)} />
              <strong>{n}</strong>
              <span className="muted small">{t}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="muted small">No account needed. Your progress stays on this device; you can back it up from Profile, and change everything later.</p>
      <button className="btn primary wide big" onClick={finish}>Start learning</button>
    </div>
  );
}
