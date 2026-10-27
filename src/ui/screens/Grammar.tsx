import { useMemo, useRef, useState, type FormEvent } from 'react';
import { COURSES, conceptLabel, index, knownWords } from '../../data/courses';
import { addXp, recordAttempt, recordErrorExample } from '../../engine/model';
import { seededRng, shuffle } from '../../engine/session';
import { checkAnswer, type CheckResult } from '../../engine/validate';
import { Empty, Meter, PlayButtons, Screen } from '../components/common';
import { IconBack } from '../components/icons';
import { go } from '../router';
import { useStore } from '../store';

export function GrammarScreen({ topicId }: { topicId: string }) {
  const { state, updateLang } = useStore();
  const lang = state.currentLang;
  const topic = index(lang).grammarById.get(topicId);
  const [phase, setPhase] = useState<'learn' | 'drill' | 'done'>('learn');
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [res, setRes] = useState<CheckResult | null>(null);
  const [score, setScore] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const typing = state.settings.typing;
  const drills = useMemo(() => {
    if (!topic) return [];
    const rng = seededRng(Date.now() % 997);
    const list = shuffle(topic.drills, rng);
    if (typing) return list;
    // Typing off: every drill becomes multiple choice, using the topic's other answers as options.
    return list.map((d) => {
      if (d.choices) return d;
      const ok = new Set(d.answers.map((a) => a.toLowerCase()));
      const pool = [...new Set(topic.drills.map((x) => x.answers[0]))].filter((a) => !ok.has(a.toLowerCase()));
      return { ...d, choices: shuffle([d.answers[0], ...shuffle(pool, rng).slice(0, 3)], rng) };
    });
  }, [topic, typing]);

  if (!topic) {
    return (
      <Screen title="Grammar" back={() => go('practice')}>
        <Empty title="This topic isn't in the current course." />
      </Screen>
    );
  }
  const d = drills[i];

  const check = (text: string, e?: FormEvent) => {
    e?.preventDefault();
    if (res) return next();
    if (!text.trim()) return;
    const r = checkAnswer(text, d.answers, { lang, articles: COURSES[lang].articles, accentTolerant: true, knownWords: knownWords(lang) });
    setRes(r);
    const ok = r.verdict !== 'wrong';
    if (ok) setScore((s) => s + 1);
    const now = Date.now();
    updateLang((p) => {
      let n = recordAttempt(p, { t: now, skill: 'grammar', correct: ok, concepts: topic.concepts });
      if (!ok) for (const c of topic.concepts) n = recordErrorExample(n, c, { got: text, want: d.answers[0], prompt: d.prompt });
      if (ok) n = addXp(n, 2, now);
      return n;
    });
  };

  const next = () => {
    setRes(null);
    setInput('');
    if (i + 1 >= drills.length) {
      const best = score / drills.length;
      updateLang((p) => ({ ...p, grammarDone: { ...p.grammarDone, [topic.id]: { best: Math.max(best, p.grammarDone[topic.id]?.best ?? 0), at: Date.now() } } }));
      setPhase('done');
    } else {
      setI(i + 1);
      setTimeout(() => ref.current?.focus(), 30);
    }
  };

  if (phase === 'learn') {
    return (
      <Screen title={topic.title} back={() => go('practice')}>
        <p className="lead">{topic.summary}</p>
        {topic.points.map((pt, k) => (
          <section key={k} className="rule">
            <p>{pt.rule}</p>
            <ul className="examples">
              {pt.examples.map((e) => (
                <li key={e.t}>
                  <span className="target">{e.t}</span> <PlayButtons text={e.t.replace(/\(.*?\)/g, '')} lang={lang} slow={false} />
                  <span className="muted">{e.en}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="muted small">Covers: {topic.concepts.map((c) => conceptLabel(lang, c)).join(', ')}</p>
        <button className="btn primary wide" onClick={() => { setPhase('drill'); setTimeout(() => ref.current?.focus(), 30); }}>Practise ({drills.length} questions)</button>
      </Screen>
    );
  }

  if (phase === 'done') {
    const pct = Math.round((score / drills.length) * 100);
    return (
      <Screen title={topic.title} back={() => go('practice')}>
        <div className="recap">
          <h2 className="display">{pct}%</h2>
          <p>{score} of {drills.length} correct.</p>
          <p className="muted">{pct >= 80 ? 'Solid. Lesson sentences that use this pattern are part of your scheduled reviews; “Practise sentences” drills them now.' : 'Worth another round. You can also drill the lesson sentences that use this pattern with “Practise sentences”.'}</p>
          <div className="row">
            <button className="btn ghost" onClick={() => { setI(0); setScore(0); setPhase('learn'); }}>Read the rules again</button>
            <button className="btn primary grow" onClick={() => go(`review/grammar/${topic.concepts[0]}`)}>Practise sentences</button>
          </div>
          <button className="btn ghost wide" onClick={() => go('practice')}>Back to practice</button>
        </div>
      </Screen>
    );
  }

  return (
    <div className={`session lang-${lang}`}>
      <header className="session-head">
        <button className="icon-btn" onClick={() => setPhase('learn')} aria-label="Back to explanation"><IconBack /></button>
        <Meter value={i / drills.length} label={`Question ${i + 1} of ${drills.length}`} />
        <span className="xp-chip">{score}/{drills.length}</span>
      </header>
      <main className="session-body">
        <form className="ex" onSubmit={(e) => check(input, e)}>
          <p className="kicker">{topic.title}</p>
          <p className="prompt target">{d.prompt.replace('___', res ? `[${d.answers[0]}]` : '_____')}</p>
          {d.en && <p className="muted">{d.en}</p>}
          {d.choices ? (
            <div className="choices">
              {d.choices.map((c) => (
                <button type="button" key={c} className={`choice${res ? (d.answers.map((a) => a.toLowerCase()).includes(c.toLowerCase()) ? ' right' : c === input ? ' wrong' : '') : ''}`} disabled={!!res} onClick={() => { setInput(c); check(c); }}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <input ref={ref} className={`answer${res ? (res.verdict !== 'wrong' ? ' ok' : ' bad') : ''}`} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Missing word" lang={lang} autoComplete="off" autoCapitalize="off" spellCheck={false} readOnly={!!res} aria-label="Missing word" />
          )}
          {res && (
            <div className={`feedback f-${res.verdict}`} role="status">
              <p className="f-head">{res.verdict === 'correct' ? 'Correct' : res.verdict === 'almost' ? 'Almost — accepted' : 'Not quite'}</p>
              {res.verdict !== 'correct' && res.feedback.filter((f) => !f.startsWith('Accepted')).map((f, k) => <p key={k}>{f}</p>)}
              <p>{d.explain}</p>
            </div>
          )}
          {(!d.choices || res) && <button type="submit" className="btn primary wide">{res ? 'Continue' : 'Check'}</button>}
        </form>
      </main>
    </div>
  );
}
