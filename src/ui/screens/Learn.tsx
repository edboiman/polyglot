import { useState } from 'react';
import { COURSES, index } from '../../data/courses';
import { lessonUnlocked } from '../../engine/session';
import { IconCheck, IconChevron, IconLock } from '../components/icons';
import { go } from '../router';
import { useStore } from '../store';
import { LangSwitcher } from './Home';

export function Learn() {
  const { state } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const course = COURSES[lang];
  const [msg, setMsg] = useState('');
  const firstOpen = index(lang).lessons.find((l) => !p.lessons[l.id]?.completedAt);

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{course.name} course</h1>
      </header>
      <LangSwitcher />
      <p className="muted small">CEFR A1 starter course. Lessons unlock in order{state.settings.freeNavigation ? ' (skipping ahead is on)' : ''}.</p>
      {msg && <p className="toast" role="status">{msg}</p>}
      <ol className="units">
        {course.units.map((u) => {
          const done = u.lessons.filter((l) => p.lessons[l.id]?.completedAt).length;
          return (
            <li key={u.number} className="unit">
              <div className="unit-head">
                <span className="unit-no" aria-hidden>{u.number}</span>
                <div>
                  <h2>{u.title}</h2>
                  <p className="muted small"><span lang={lang}>{u.theme}</span> · {u.cefr} · {done}/{u.lessons.length} done</p>
                </div>
              </div>
              <ul className="lessons">
                {u.lessons.map((l) => {
                  const rec = p.lessons[l.id];
                  const open = lessonUnlocked(lang, l.id, p, state.settings.freeNavigation);
                  const current = firstOpen?.id === l.id;
                  return (
                    <li key={l.id}>
                      <button
                        className={`lesson-row${rec?.completedAt ? ' done' : ''}${current ? ' current' : ''}`}
                        onClick={() => (open ? go(`lesson/${l.id}`) : setMsg(`Complete the previous lesson first, or turn on “Allow skipping ahead” in Profile.`))}
                        aria-disabled={!open}
                      >
                        <span className="lesson-state" aria-hidden>
                          {rec?.completedAt ? <IconCheck size={18} /> : open ? <span className="dot" /> : <IconLock size={16} />}
                        </span>
                        <span className="lesson-text">
                          <span className="lesson-title">{l.title}</span>
                          <span className="muted small">{l.situation} · {l.minutes} min{rec?.completedAt ? ` · best ${Math.round(rec.bestScore * 100)}%` : ''}{p.resume?.lessonId === l.id ? ' · in progress' : ''}</span>
                        </span>
                        <IconChevron size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      <p className="muted small">A2 and B1 courses can be added as new units in the same format — see the developer docs.</p>
    </div>
  );
}
