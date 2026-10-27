/**
 * Renders one exercise and grades the learner's response. The parent
 * (SessionRunner) commits results to the learner model when the learner
 * presses Continue, so a mis-graded answer can be overridden first.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { COURSES, index, knownWords, productionForm, productionPrompt, topicForConcept } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { RecognitionError, listenOnce, recognitionErrorMessage, recognitionSupported } from '../../audio/speech';
import { type CheckResult, checkAnswer } from '../../engine/validate';
import { type Exercise, expectedAnswers } from '../../engine/session';
type SayEx = Extract<Exercise, { t: 'say' }>;
type MeaningEx = Extract<Exercise, { t: 'meaning' }>;
import { PlayButtons, TapText, useAudio } from '../components/common';
import { IconBulb, IconMic, IconSpeaker } from '../components/icons';
import { useStore } from '../store';

export interface Outcome {
  correct: boolean;
  /** FSRS grade 1–4. */
  grade: 1 | 2 | 3 | 4;
  result?: CheckResult;
  given?: string;
  usedHint?: boolean;
  /** Speaking judged by the learner rather than the recogniser. */
  selfAssessed?: boolean;
  skipped?: boolean;
  /** The learner marked a rejected answer as correct. */
  overridden?: boolean;
  /**
   * The learner revealed the answer and rated their own recall. The rating
   * schedules the card, but the attempt never counts toward mastery.
   */
  selfRated?: boolean;
}

interface Props {
  lang: LangCode;
  ex: Exercise;
  onDone: (o?: Outcome) => void;
  /** Number of recent errors per concept, for recurring-error help. */
  recentErrors: (concept: string) => number;
}

const ENTER_HINT = 'Press Enter to check';

export function ExerciseView({ lang, ex, onDone, recentErrors }: Props) {
  const idx = index(lang);
  const { state } = useStore();
  const audio = useAudio(lang);
  const [input, setInput] = useState('');
  const [bank, setBank] = useState<number[]>([]);
  const [hint, setHint] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const course = COURSES[lang];

  useEffect(() => {
    setInput('');
    setBank([]);
    setHint(0);
    setReveal(false);
    setOutcome(null);
    const auto = state.settings.autoplayAudio;
    if (ex.t === 'present' && auto) {
      const v = idx.vocabById.get(ex.vocabId)!;
      void audio.say(productionForm(v));
    }
    if ((ex.t === 'listen' || ex.t === 'listenWord' || (ex.t === 'choice' && ex.audio)) && audio.available) {
      const text = ex.t === 'listen' ? idx.sentenceById.get(ex.sentenceId)!.t : idx.vocabById.get(ex.vocabId)!.lemma;
      const id = window.setTimeout(() => void audio.say(text), 250);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex]);

  useEffect(() => {
    if (outcome) continueRef.current?.focus();
  }, [outcome]);

  const grade = (text: string, extra: Partial<Outcome> = {}) => {
    const answers = expectedAnswers(lang, ex);
    const isEn = (ex.t === 'recall' && ex.dir === 'tl2en') || (ex.t === 'translate' && ex.dir === 'tl2en');
    const isNounProduction = ex.t === 'recall' && ex.dir === 'en2tl' && idx.vocabById.get(ex.vocabId)?.pos === 'noun';
    const r = checkAnswer(text, answers, {
      lang: isEn ? 'en' : lang,
      loose: isEn && ex.t === 'recall',
      articles: isEn ? undefined : course.articles,
      articleOptional: isNounProduction,
      knownWords: isEn ? undefined : knownWords(lang),
    });
    const usedHint = hint > 0 || reveal || !!extra.usedHint;
    const g: 1 | 2 | 3 = r.verdict === 'wrong' ? 1 : r.verdict === 'almost' || usedHint ? 2 : 3;
    setOutcome({ correct: r.verdict !== 'wrong', grade: g, result: r, given: text, usedHint, ...extra });
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (outcome) return onDone(outcome);
    if (ex.t === 'translate' && ex.bank) {
      const text = bank.map((i) => ex.bank![i]).join(' ');
      if (!text) return;
      return grade(text);
    }
    if (!input.trim()) return;
    grade(input);
  };

  const override = () => outcome && setOutcome({ ...outcome, correct: true, grade: 2, overridden: true, result: outcome.result && { ...outcome.result, verdict: 'almost', feedback: ['Marked as correct by you.'] } });

  /* ------------------------------------------------- non-graded screens */

  if (ex.t === 'intro') {
    const l = idx.lessonById.get(ex.lessonId)!;
    return (
      <div className="ex ex-intro">
        <p className="kicker">Unit {l.unit} · {l.situation}</p>
        <h2 className="display">{l.title}</h2>
        <p className="lead">{l.intro}</p>
        {l.tip && (
          <aside className="tip">
            <h3><IconBulb size={18} /> {l.tip.title}</h3>
            <p>{l.tip.body}</p>
          </aside>
        )}
        <p className="muted small">About {l.minutes} minutes · {l.vocab.length} new words</p>
        <button className="btn primary wide" onClick={() => onDone()} autoFocus>Start</button>
      </div>
    );
  }

  if (ex.t === 'dialogue') {
    const l = idx.lessonById.get(ex.lessonId)!;
    const mode = state.settings.showTranslations;
    return (
      <div className="ex ex-dialogue">
        <h2>In context</h2>
        <p className="muted">Read (and listen to) the conversation. Tap any word for its meaning.</p>
        <ol className="dialogue">
          {l.dialogue.map((d, i) => (
            <DialogueLine key={i} who={d.who} t={d.t} en={d.en} lang={lang} mode={mode} />
          ))}
        </ol>
        {audio.available && (
          <button
            className="btn ghost"
            onClick={() => void audio.sayAll(l.dialogue.map((d) => d.t))}
          >
            <IconSpeaker size={18} /> Play the whole conversation
          </button>
        )}
        <button className="btn primary wide" onClick={() => onDone()}>Continue</button>
      </div>
    );
  }

  if (ex.t === 'present') {
    const v = idx.vocabById.get(ex.vocabId)!;
    return (
      <div className="ex ex-present">
        <p className="kicker">New {v.pos === 'phrase' ? 'phrase' : 'word'}</p>
        <div className="word-card">
          <div className="word-line">
            <span className="target big">{productionForm(v)}</span>
            <PlayButtons text={productionForm(v)} lang={lang} />
          </div>
          {v.gender && v.pos === 'noun' && <span className={`gender g-${v.gender}`}>{genderName(v.gender)}</span>}
          {v.plural && <p className="muted small">Plural: {v.plural}</p>}
          {v.pron && <p className="pron">Sounds like: {v.pron}</p>}
          <p className="meaning">{v.en}{v.enAlt?.length ? <span className="muted"> · {v.enAlt.slice(0, 2).join(', ')}</span> : null}</p>
          {v.note && <p className="note">{v.note}</p>}
          {v.example && (
            <p className="example">
              <span className="target">{v.example.t}</span>
              <span className="muted">{v.example.en}</span>
            </p>
          )}
        </div>
        <button className="btn primary wide" onClick={() => onDone()} autoFocus>Got it</button>
      </div>
    );
  }

  if (ex.t === 'recap') return null; // rendered by the runner

  /* ----------------------------------------------------- graded screens */

  const feedback = outcome && (
    <FeedbackPanel
      lang={lang}
      ex={ex}
      outcome={outcome}
      onOverride={outcome.result && !outcome.correct && ex.t !== 'choice' ? override : undefined}
      recentErrors={recentErrors}
    />
  );
  const continueBtn = outcome && (
    <button ref={continueRef} className={`btn wide ${outcome.correct ? 'primary' : 'danger'}`} onClick={() => onDone(outcome)}>
      Continue
    </button>
  );

  if (ex.t === 'say') return <SayExercise lang={lang} ex={ex} onDone={onDone} />;
  if (ex.t === 'meaning') return <MeaningExercise lang={lang} ex={ex} onDone={onDone} />;

  if (ex.t === 'choice') {
    const v = idx.vocabById.get(ex.vocabId)!;
    const pick = (o: string) => {
      if (outcome) return;
      const ok = [v.en, ...(v.enAlt ?? [])].some((m) => m.toLowerCase() === o.toLowerCase());
      setOutcome({ correct: ok, grade: ok ? 3 : 1, given: o, result: { verdict: ok ? 'correct' : 'wrong', expected: v.en, issues: [], feedback: ok ? [] : [`Correct answer: ${v.en}`] } });
    };
    return (
      <div className="ex">
        <p className="kicker">{ex.audio ? 'Listen and choose the meaning' : 'What does this mean?'}</p>
        {ex.audio && audio.available ? (
          <div className="prompt-audio">
            <PlayButtons text={v.lemma} lang={lang} />
            {outcome && <span className="target">{v.lemma}</span>}
          </div>
        ) : (
          <p className="prompt target">{productionForm(v)}</p>
        )}
        <div className="choices" role="group" aria-label="Answer choices">
          {ex.options.map((o) => (
            <button
              key={o}
              className={`choice${outcome ? (o === v.en ? ' right' : o === outcome.given ? ' wrong' : '') : ''}`}
              onClick={() => pick(o)}
              disabled={!!outcome}
            >
              {o}
            </button>
          ))}
        </div>
        {feedback}
        {continueBtn}
      </div>
    );
  }

  let promptEl: ReactElement;
  let placeholder = 'Type your answer';
  let inputLang = lang as string;

  switch (ex.t) {
    case 'recall': {
      const v = idx.vocabById.get(ex.vocabId)!;
      if (ex.dir === 'en2tl') {
        const ans = productionForm(v);
        promptEl = (
          <>
            <p className="kicker">{ex.final ? 'Final check · ' : ''}Write in {course.name}</p>
            <p className="prompt">{productionPrompt(v)}</p>
            {v.pos === 'noun' && <p className="muted small">Include the article ({lang === 'de' ? 'der / die / das' : lang === 'es' ? 'el / la' : 'le / la / l\''}).</p>}
            {ex.hints && !outcome && (
              <div className="hint-row">
                <button type="button" className="mini" onClick={() => setHint((h) => Math.min(3, h + 1))} disabled={hint >= 3}>
                  {hint === 0 ? 'Show a hint' : 'More hint'}
                </button>
                {hint > 0 && <span className="hint target">{hintFor(ans, hint)}</span>}
              </div>
            )}
          </>
        );
        placeholder = `In ${course.name}`;
      } else {
        inputLang = 'en';
        promptEl = (
          <>
            <p className="kicker">Translate into English</p>
            <p className="prompt target">{productionForm(v)} <PlayButtons text={v.lemma} lang={lang} slow={false} /></p>
          </>
        );
        placeholder = 'In English';
      }
      break;
    }
    case 'listenWord': {
      promptEl = (
        <>
          <p className="kicker">Type the word you hear</p>
          <div className="prompt-audio"><PlayButtons text={idx.vocabById.get(ex.vocabId)!.lemma} lang={lang} /></div>
        </>
      );
      placeholder = `What you hear, in ${course.name}`;
      break;
    }
    case 'cloze': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      const [before, after] = splitCloze(s.t, s.cloze!);
      promptEl = (
        <>
          <p className="kicker">{ex.final ? 'Final check · ' : ''}Complete the sentence</p>
          <p className="prompt target cloze-line">
            {before}<span className="blank">{outcome ? s.cloze : '_____'}</span>{after}
          </p>
          {s.clozeHint && <p className="muted">Hint: {s.clozeHint}</p>}
          <p className="muted small">{s.en}</p>
        </>
      );
      placeholder = 'Missing word';
      break;
    }
    case 'listen': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      promptEl = (
        <>
          <p className="kicker">{ex.final ? 'Final check · ' : ''}Listen and type what you hear</p>
          <div className="prompt-audio"><PlayButtons text={s.t} lang={lang} /></div>
          {!outcome && (
            <button type="button" className="mini" onClick={() => setReveal(true)} disabled={reveal}>
              {reveal ? 'Transcript shown' : 'Show transcript (counts as a hint)'}
            </button>
          )}
          {(reveal || outcome) && <p className="target transcript">{s.t}</p>}
          {outcome && <p className="muted small">{s.en}</p>}
        </>
      );
      placeholder = `What you hear, in ${course.name}`;
      break;
    }
    case 'translate': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      if (ex.dir === 'tl2en') {
        inputLang = 'en';
        promptEl = (
          <>
            <p className="kicker">Translate into English</p>
            <p className="prompt target"><TapText text={s.t} lang={lang} /></p>
            <PlayButtons text={s.t} lang={lang} />
          </>
        );
        placeholder = 'In English';
      } else {
        promptEl = (
          <>
            <p className="kicker">{ex.final ? 'Final check · ' : ''}Say it in {course.name}</p>
            <p className="prompt">{s.en}</p>
          </>
        );
        placeholder = `In ${course.name}`;
      }
      break;
    }
    case 'speak':
      return <SpeakExercise lang={lang} sentenceId={ex.sentenceId} onDone={onDone} />;
    default:
      return null;
  }

  return (
    <form className="ex" onSubmit={submit}>
      {promptEl}
      {ex.t === 'translate' && ex.bank ? (
        <WordBank words={ex.bank} picked={bank} setPicked={setBank} disabled={!!outcome} />
      ) : (
        <input
          ref={inputRef}
          className={`answer${outcome ? (outcome.correct ? ' ok' : ' bad') : ''}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          lang={inputLang}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={!!outcome}
          aria-label={placeholder}
          enterKeyHint={outcome ? 'next' : 'done'}
        />
      )}
      {inputLang !== 'en' && !outcome && !(ex.t === 'translate' && ex.bank) && (
        <AccentBar lang={lang} onInsert={(c) => { setInput((v) => v + c); inputRef.current?.focus(); }} />
      )}
      {feedback}
      {outcome ? continueBtn : (
        <button type="submit" className="btn primary wide" title={ENTER_HINT}>Check</button>
      )}
      {!outcome && ex.t === 'listen' && !audio.available && (
        <button type="button" className="btn ghost wide" onClick={() => onDone({ correct: false, grade: 1, skipped: true })}>Skip (audio unavailable)</button>
      )}
    </form>
  );
}

/* --------------------------------------------------------------- pieces */

function DialogueLine({ who, t, en, lang, mode }: { who: string; t: string; en: string; lang: LangCode; mode: 'always' | 'tap' | 'never' }) {
  const [show, setShow] = useState(mode === 'always');
  return (
    <li className="line">
      <span className="who">{who}</span>
      <span className="said target"><TapText text={t} lang={lang} /></span>
      <span className="line-tools">
        <PlayButtons text={t} lang={lang} slow={false} />
        {mode !== 'never' && (
          <button type="button" className="mini" onClick={() => setShow((s) => !s)} aria-expanded={show}>
            {show ? 'Hide English' : 'English'}
          </button>
        )}
      </span>
      {show && <span className="trans">{en}</span>}
    </li>
  );
}

function WordBank({ words, picked, setPicked, disabled }: { words: string[]; picked: number[]; setPicked: (p: number[]) => void; disabled: boolean }) {
  return (
    <div className="bank">
      <div className="bank-answer" aria-label="Your sentence" aria-live="polite">
        {picked.length === 0 && <span className="muted">Tap words in order</span>}
        {picked.map((i, k) => (
          <button type="button" key={k} className="tile on" disabled={disabled} onClick={() => setPicked(picked.filter((_, j) => j !== k))}>
            {words[i]}
          </button>
        ))}
      </div>
      <div className="bank-pool">
        {words.map((w, i) => (
          <button type="button" key={i} className="tile" disabled={disabled || picked.includes(i)} onClick={() => setPicked([...picked, i])}>
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

const ACCENTS: Record<LangCode, string[]> = {
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
  de: ['ä', 'ö', 'ü', 'ß'],
  fr: ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'û', 'ù', 'ë', 'œ'],
};

function AccentBar({ lang, onInsert }: { lang: LangCode; onInsert: (c: string) => void }) {
  return (
    <div className="accents" aria-label="Special characters">
      {ACCENTS[lang].map((c) => (
        <button type="button" key={c} className="accent" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(c)} lang={lang}>
          {c}
        </button>
      ))}
    </div>
  );
}

function FeedbackPanel({ lang, ex, outcome, onOverride, recentErrors }: { lang: LangCode; ex: Exercise; outcome: Outcome; onOverride?: () => void; recentErrors: (c: string) => number }) {
  const idx = index(lang);
  const r = outcome.result;
  const verdict = r?.verdict ?? (outcome.correct ? 'correct' : 'wrong');
  const head = verdict === 'correct' ? 'Correct' : verdict === 'almost' ? 'Almost — accepted' : 'Not quite';
  // Grammar explanation and extra examples for recurring mistakes.
  const concepts =
    ex.t === 'cloze' || ex.t === 'translate' || ex.t === 'listen'
      ? idx.sentenceById.get(ex.sentenceId)?.grammar ?? []
      : ex.t === 'recall'
        ? idx.vocabById.get(ex.vocabId)?.grammar ?? []
        : [];
  const recurring = !outcome.correct ? concepts.find((c) => recentErrors(c) >= 2) : undefined;
  const topic = recurring ? topicForConcept(lang, recurring) : undefined;
  const v = ex.t === 'recall' || ex.t === 'listenWord' ? idx.vocabById.get(ex.vocabId) : undefined;
  const s = 'sentenceId' in ex ? idx.sentenceById.get(ex.sentenceId) : undefined;
  return (
    <div className={`feedback f-${verdict}`} role="status" aria-live="polite">
      <p className="f-head">{head}</p>
      {r?.feedback.filter((f) => !f.startsWith('Accepted')).map((f, i) => <p key={i}>{f}</p>)}
      {outcome.correct && r && r.expected && normalizeLoose(r.expected) !== normalizeLoose(outcome.given ?? '') && (
        <p className="muted">Model answer: <span className="target">{r.expected}</span></p>
      )}
      {v?.note && !outcome.correct && <p className="note">{v.note}</p>}
      {s && ex.t === 'translate' && ex.dir === 'tl2en' && <p className="muted small">{s.t}</p>}
      {topic && (
        <div className="recurring">
          <p><strong>This pattern has tripped you up a few times.</strong> {topic.points[0].rule}</p>
          <ul>
            {topic.points[0].examples.slice(0, 2).map((e) => (
              <li key={e.t}><span className="target">{e.t}</span> — {e.en}</li>
            ))}
          </ul>
          <p className="muted small">It will come back in your reviews; you can also practise it in Practice › Grammar.</p>
        </div>
      )}
      {onOverride && (
        <button type="button" className="mini" onClick={onOverride}>My answer was also right</button>
      )}
    </div>
  );
}

function SpeakExercise({ lang, sentenceId, onDone }: { lang: LangCode; sentenceId: string; onDone: (o?: Outcome) => void }) {
  const s = index(lang).sentenceById.get(sentenceId)!;
  const { state } = useStore();
  const [status, setStatus] = useState<'idle' | 'listening' | 'done' | 'error'>('idle');
  const [heard, setHeard] = useState<string>('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [err, setErr] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const canRecognise = recognitionSupported() && state.settings.microphone;

  const start = async () => {
    setStatus('listening');
    setErr('');
    const { promise, stop } = listenOnce(lang);
    stopRef.current = stop;
    try {
      const res = await promise;
      // Use the recogniser alternative closest to the target.
      let best: CheckResult | null = null;
      let bestText = res.transcripts[0] ?? '';
      for (const t of res.transcripts) {
        const r = checkAnswer(t, [s.t, ...(s.alt ?? [])], { lang, articles: COURSES[lang].articles, knownWords: knownWords(lang) });
        if (!best || rank(r) > rank(best)) {
          best = r;
          bestText = t;
        }
      }
      setHeard(bestText);
      setResult(best);
      setStatus('done');
    } catch (e) {
      setErr(recognitionErrorMessage(e instanceof RecognitionError ? e.code : 'unknown'));
      setStatus('error');
    }
  };

  useEffect(() => () => stopRef.current(), []);

  const recognised = result && result.verdict !== 'wrong';
  return (
    <div className="ex ex-speak">
      <p className="kicker">Say it aloud</p>
      <p className="prompt target">{s.t}</p>
      <p className="muted">{s.en}</p>
      <PlayButtons text={s.t} lang={lang} label="Model" />
      {canRecognise ? (
        <>
          {status !== 'done' && (
            <button className={`mic-btn${status === 'listening' ? ' live' : ''}`} onClick={status === 'listening' ? () => stopRef.current() : start} aria-label={status === 'listening' ? 'Stop listening' : 'Start speaking'}>
              <IconMic size={30} />
              <span>{status === 'listening' ? 'Listening… tap to stop' : 'Tap and speak'}</span>
            </button>
          )}
          {err && <p className="warn">{err}</p>}
          {status === 'done' && result && (
            <div className={`feedback f-${recognised ? 'correct' : 'wrong'}`} role="status">
              <p className="f-head">{recognised ? 'The recogniser understood you' : 'The recogniser heard something different'}</p>
              <p>It heard: <span className="target">“{heard || '…'}”</span></p>
              {!recognised && result.feedback.slice(0, 2).map((f, i) => <p key={i}>{f}</p>)}
              <p className="muted small">
                This checks whether speech recognition understood your words. It cannot score your accent or individual sounds — compare yourself with the model audio for that.
              </p>
            </div>
          )}
          <div className="row">
            {status === 'done' && !recognised && <button className="btn ghost" onClick={() => { setStatus('idle'); setResult(null); }}>Try again</button>}
            {status === 'done' && (
              <button className="btn primary grow" onClick={() => onDone({ correct: !!recognised, grade: recognised ? 3 : 2 })}>Continue</button>
            )}
            {status !== 'done' && <button className="btn ghost grow" onClick={() => onDone({ correct: true, grade: 3, selfAssessed: true })}>I said it (not checked)</button>}
            {status !== 'done' && <button className="btn ghost" onClick={() => onDone({ correct: false, grade: 3, skipped: true })}>Skip</button>}
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            {state.settings.microphone ? 'Speech recognition is not available in this browser.' : 'Speaking checks are switched off in Profile.'} Say the sentence aloud after the model — saying it helps memory even without a check.
          </p>
          <div className="row">
            <button className="btn primary grow" onClick={() => onDone({ correct: true, grade: 3, selfAssessed: true })}>I said it</button>
            <button className="btn ghost" onClick={() => onDone({ correct: false, grade: 3, skipped: true })}>Skip</button>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- helpers */

function rank(r: CheckResult) {
  return (r.verdict === 'correct' ? 100 : r.verdict === 'almost' ? 50 : 0) - r.issues.length;
}

function normalizeLoose(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function hintFor(answer: string, level: number): string {
  // Level 1: first letter of each word + lengths; 2: first two letters; 3: half of each word.
  return answer
    .split(' ')
    .map((w) => {
      const keep = level === 1 ? 1 : level === 2 ? 2 : Math.ceil(w.length / 2);
      return w.slice(0, keep) + w.slice(keep).replace(/\p{L}/gu, '·');
    })
    .join(' ');
}

function splitCloze(text: string, word: string): [string, string] {
  const re = new RegExp(`(^|[\\s¿¡'"«(])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[\\s.,!?;:»)])`, 'i');
  const m = text.match(re);
  if (!m || m.index === undefined) return [text + ' ', ''];
  const start = m.index + m[1].length;
  return [text.slice(0, start), text.slice(start + m[2].length)];
}

function genderName(g: string) {
  return g === 'm' ? 'masculine' : g === 'f' ? 'feminine' : g === 'n' ? 'neuter' : 'plural';
}

/* ------------------------------------------------------------ spoken mode */

const RATINGS: { grade: 1 | 2 | 3 | 4; label: string; cls: string }[] = [
  { grade: 1, label: "Didn't get it", cls: 'danger-ghost' },
  { grade: 2, label: 'With effort', cls: 'ghost' },
  { grade: 3, label: 'Got it', cls: 'primary' },
  { grade: 4, label: 'Easy', cls: 'ghost' },
];

/**
 * Say a word or sentence aloud. With speech recognition, the answer is
 * checked automatically; if the recogniser doesn't match (or isn't
 * available), the learner hears the model answer and rates their recall.
 */
function SayExercise({ lang, ex, onDone }: { lang: LangCode; ex: SayEx; onDone: (o?: Outcome) => void }) {
  const { state } = useStore();
  const idx = index(lang);
  const audio = useAudio(lang);
  const course = COURSES[lang];
  const answers = expectedAnswers(lang, ex);
  const v = ex.from === 'vocab' ? idx.vocabById.get(ex.id)! : undefined;
  const s = ex.from === 'sentence' ? idx.sentenceById.get(ex.id)! : undefined;
  const answer = v ? productionForm(v) : s!.t;
  const canRecognise = recognitionSupported() && state.settings.microphone;
  const [phase, setPhase] = useState<'ask' | 'listening' | 'matched' | 'reveal'>('ask');
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [err, setErr] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => stopRef.current(), []);
  useEffect(() => {
    if (phase === 'reveal' || phase === 'matched') {
      if (state.settings.autoplayAudio && audio.available) void audio.say(answer);
      continueRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const listen = async () => {
    setPhase('listening');
    setErr('');
    const rec = listenOnce(lang);
    stopRef.current = rec.stop;
    try {
      const res = await rec.promise;
      let best: CheckResult | null = null;
      let bestText = res.transcripts[0] ?? '';
      for (const t of res.transcripts) {
        const r = checkAnswer(t, answers, {
          lang,
          articles: course.articles,
          knownWords: knownWords(lang),
          articleOptional: v?.pos === 'noun',
        });
        if (!best || rank(r) > rank(best)) {
          best = r;
          bestText = t;
        }
      }
      setHeard(bestText);
      setResult(best);
      setPhase(best && best.verdict !== 'wrong' ? 'matched' : 'reveal');
    } catch (e) {
      setErr(recognitionErrorMessage(e instanceof RecognitionError ? e.code : 'unknown'));
      setPhase('ask');
    }
  };

  const [before, after] = s && ex.prompt === 'cloze' && s.cloze ? splitCloze(s.t, s.cloze) : ['', ''];

  return (
    <div className="ex ex-say">
      <p className="kicker">{ex.final ? 'Final check · ' : ''}{ex.prompt === 'cloze' ? 'Say the whole sentence' : `Say it in ${course.name}`}</p>
      {ex.prompt === 'cloze' && s ? (
        <>
          <p className="prompt target cloze-line">
            {before}<span className="blank">{phase === 'ask' || phase === 'listening' ? '_____' : s.cloze}</span>{after}
          </p>
          {s.clozeHint && <p className="muted">Missing word: {s.clozeHint}</p>}
          <p className="muted small">{s.en}</p>
        </>
      ) : (
        <>
          <p className="prompt">{v ? productionPrompt(v) : s!.en}</p>
          {v?.pos === 'noun' && <p className="muted small">Say it with its article ({lang === 'de' ? 'der / die / das' : lang === 'es' ? 'el / la' : "le / la / l'"}).</p>}
        </>
      )}

      {(phase === 'ask' || phase === 'listening') && (
        <>
          {canRecognise ? (
            <button className={`mic-btn${phase === 'listening' ? ' live' : ''}`} onClick={phase === 'listening' ? () => stopRef.current() : listen} aria-label={phase === 'listening' ? 'Stop listening' : 'Tap and say it'}>
              <IconMic size={30} />
              <span>{phase === 'listening' ? 'Listening… tap to stop' : 'Tap and say it'}</span>
            </button>
          ) : (
            <p className="muted">Say it out loud, then check yourself.</p>
          )}
          {err && <p className="warn">{err}</p>}
          <button className={`btn wide ${canRecognise ? 'ghost' : 'primary'}`} onClick={() => setPhase('reveal')} disabled={phase === 'listening'}>
            {canRecognise ? 'Show the answer instead' : 'Show the answer'}
          </button>
        </>
      )}

      {phase === 'matched' && result && (
        <>
          <div className={`feedback f-${result.verdict}`} role="status">
            <p className="f-head">{result.verdict === 'correct' ? 'Correct' : 'Understood'}</p>
            <p>Heard: <span className="target">“{heard}”</span></p>
            <p>Answer: <span className="target">{answer}</span> <PlayButtons text={answer} lang={lang} /></p>
            {result.feedback.filter((f) => !f.startsWith('Accepted')).slice(0, 2).map((f, i) => <p key={i}>{f}</p>)}
            <p className="muted small">Speech recognition checks your words, not your accent — compare yourself with the model audio.</p>
          </div>
          <button ref={continueRef} className="btn primary wide" onClick={() => onDone({ correct: true, grade: result.verdict === 'correct' ? 3 : 2, result, given: heard })}>
            Continue
          </button>
        </>
      )}

      {phase === 'reveal' && (
        <>
          <div className="feedback f-reveal" role="status">
            {heard && <p>The recogniser heard <span className="target">“{heard}”</span>. Recognition can miss correct speech, so compare for yourself.</p>}
            <p className="reveal-answer target">{answer} <PlayButtons text={answer} lang={lang} /></p>
            {v && v.en !== answer && <p className="muted small">{v.en}{v.note ? ` · ${v.note}` : ''}</p>}
            {s && <p className="muted small">{s.en}</p>}
          </div>
          <p className="small">How did you do?</p>
          <div className="rate-row" role="group" aria-label="Rate your answer">
            {RATINGS.map((r, i) => (
              <button
                key={r.grade}
                ref={i === 2 ? continueRef : undefined}
                className={`btn ${r.cls}`}
                onClick={() => onDone({ correct: r.grade > 1, grade: r.grade, selfRated: true })}
              >
                {r.label}
              </button>
            ))}
          </div>
          {canRecognise && <button className="link" onClick={() => { setHeard(''); setPhase('ask'); }}>Try saying it again</button>}
        </>
      )}
    </div>
  );
}

/** Choose the English meaning of a sentence you read or hear. */
function MeaningExercise({ lang, ex, onDone }: { lang: LangCode; ex: MeaningEx; onDone: (o?: Outcome) => void }) {
  const s = index(lang).sentenceById.get(ex.sentenceId)!;
  const audio = useAudio(lang);
  const useAudioPrompt = ex.audio && audio.available;
  const [picked, setPicked] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const ok = new Set([s.en, ...(s.enAlt ?? [])].map((x) => x.toLowerCase()));

  useEffect(() => {
    if (!useAudioPrompt) return;
    const id = window.setTimeout(() => void audio.say(s.t), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const right = picked !== null && ok.has(picked.toLowerCase());
  return (
    <div className="ex">
      <p className="kicker">{ex.final ? 'Final check · ' : ''}{useAudioPrompt ? 'Listen. What does it mean?' : 'What does this mean?'}</p>
      {useAudioPrompt ? (
        <div className="prompt-audio">
          <PlayButtons text={s.t} lang={lang} />
          {!picked && !showText && <button className="mini" onClick={() => setShowText(true)}>Show text</button>}
        </div>
      ) : null}
      {(!useAudioPrompt || showText || picked) && (
        <p className="prompt target"><TapText text={s.t} lang={lang} /> {!useAudioPrompt && <PlayButtons text={s.t} lang={lang} slow={false} />}</p>
      )}
      <div className="choices" role="group" aria-label="Answer choices">
        {ex.options.map((o) => (
          <button
            key={o}
            className={`choice${picked ? (ok.has(o.toLowerCase()) ? ' right' : o === picked ? ' wrong' : '') : ''}`}
            disabled={!!picked}
            onClick={() => setPicked(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {picked && (
        <>
          <div className={`feedback f-${right ? 'correct' : 'wrong'}`} role="status">
            <p className="f-head">{right ? 'Correct' : 'Not quite'}</p>
            {!right && <p>It means: {s.en}</p>}
          </div>
          <button
            className={`btn wide ${right ? 'primary' : 'danger'}`}
            autoFocus
            onClick={() => onDone({ correct: right, grade: right ? (showText ? 2 : 3) : 1, usedHint: showText })}
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}
