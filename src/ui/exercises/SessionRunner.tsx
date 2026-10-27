/**
 * Runs a sequence of exercises (a lesson, a review or a practice set):
 * commits each graded answer to the learner model, re-queues mistakes,
 * adapts the remaining lesson to performance, autosaves lesson position,
 * and shows a recap.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { COURSES, conceptLabel, index, productionForm } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { stopSpeaking } from '../../audio/speech';
import { type Grade, formatInterval } from '../../engine/fsrs';
import {
  addTime, addXp, applyReview, completeLesson, noteNewIntroduced, recordAttempt, recordErrorExample, schedulerOptions,
} from '../../engine/model';
import { type Exercise, meta } from '../../engine/session';
import { type SessionSnapshot, answerStep, initSession, sessionScore, skipStep } from '../../engine/sessionState';
import { Meter } from '../components/common';
import { IconClose } from '../components/icons';
import { useStore } from '../store';
import { ExerciseView, type Outcome } from './ExerciseView';

export type SessionMode = 'lesson' | 'review' | 'practice';

interface Props {
  lang: LangCode;
  /** A new session's exercises… */
  exercises?: Exercise[];
  /** …or a saved snapshot to resume. */
  snapshot?: SessionSnapshot;
  mode: SessionMode;
  lessonId?: string;
  title: string;
  onExit: () => void;
  onFinished?: (r: { correct: number; answered: number }) => void;
}

/** XP: rewards retrieval, more for production, scheduled reviews and the final check. Nothing for page turns. */
export function xpFor(ex: Exercise, correctFirstTry: boolean, wasDue: boolean): number {
  if (!correctFirstTry) return 0;
  if ('final' in ex && ex.final) return 3;
  if (wasDue) return 3;
  if (ex.t === 'choice') return 1;
  if (ex.t === 'translate' && ex.dir === 'en2tl') return 3;
  return 2;
}

export function SessionRunner({ lang, exercises, snapshot, mode, lessonId, title, onExit, onFinished }: Props) {
  const { state, updateLang, flush } = useStore();
  const progress = state.langs[lang];
  // The snapshot is hydrated once, before any autosave can run, so resumed totals are never overwritten.
  const [snap, setSnap] = useState<SessionSnapshot>(() => snapshot ?? initSession(exercises ?? []));
  const completedRef = useRef(false);
  const lastTick = useRef(Date.now());
  const sessionStart = useRef(Date.now());

  // Count active time (gaps longer than 2 minutes are treated as a break).
  const tick = () => {
    const now = Date.now();
    const gap = Math.min(120, (now - lastTick.current) / 1000);
    lastTick.current = now;
    return gap;
  };

  useEffect(() => () => stopSpeaking(), []);

  // Autosave the complete lesson snapshot after every step.
  useEffect(() => {
    if (mode !== 'lesson' || !lessonId || snap.done) return;
    updateLang((p) => ({ ...p, resume: { lessonId, snapshot: snap, startedAt: sessionStart.current, savedAt: Date.now() } }), lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const ex = snap.queue[snap.pos];
  const total = snap.queue.length;

  const recentErrors = useMemo(() => {
    const since = Date.now() - 14 * 86_400_000;
    return (c: string) => (progress.errors[c]?.recent ?? []).filter((t) => t >= since).length;
  }, [progress.errors]);

  /** Completion uses the snapshot that already includes the last answer, and runs once. */
  const complete = (final: SessionSnapshot) => {
    if (completedRef.current) return;
    completedRef.current = true;
    const secs = tick();
    const now = Date.now();
    updateLang((p) => {
      let next = addTime(p, secs, now);
      if (mode === 'lesson' && lessonId) {
        const first = !p.lessons[lessonId]?.completedAt;
        next = completeLesson(next, lessonId, sessionScore(final.stats), now);
        next = addXp(next, first ? 10 : 2, now);
      }
      return next;
    }, lang);
    void flush();
    onFinished?.({ correct: final.stats.correct, answered: final.stats.answered });
  };

  const commit = (next: SessionSnapshot) => {
    setSnap(next);
    if (next.done) complete(next);
  };

  const onDone = (o?: Outcome) => {
    if (!ex || snap.done) return;
    if (ex.t === 'present' && mode === 'lesson') {
      // Count each word once, when it is first introduced (not when re-shown after a mistake).
      const known = progress.cards[`p:${ex.vocabId}`] || progress.cards[`r:${ex.vocabId}`];
      if (!known && !snap.answeredKeys.includes(`intro:${ex.vocabId}`)) {
        updateLang((p) => noteNewIntroduced(p, 1, Date.now()), lang);
        return commit({ ...skipStep(snap), answeredKeys: [...snap.answeredKeys, `intro:${ex.vocabId}`] });
      }
    }
    const m = meta(lang, ex);
    if (!o || !m.graded || o.skipped) return commit(skipStep(snap));

    const now = Date.now();
    const opts = schedulerOptions(state.settings);
    const cardRec = m.card ? progress.cards[`${m.card.kind}:${m.card.itemId}`] : undefined;
    const wasDue = !!cardRec && cardRec.card.state !== 'new' && cardRec.card.due <= now;
    const secs = tick();

    const provisional = answerStep(snap, { correct: o.correct, xp: 0, label: describeItem(lang, ex), lesson: mode === 'lesson', typing: state.settings.typing });
    const isFirst = provisional.isFirst;
    // Self-rated recall earns a token point; checked answers earn full XP.
    const xp = o.selfAssessed ? 0 : o.selfRated ? (o.correct && isFirst && o.grade >= 3 ? 1 : 0) : xpFor(ex, o.correct && isFirst && !o.usedHint && !o.overridden, wasDue);
    const result = { ...provisional.snapshot, stats: { ...provisional.snapshot.stats, xp: provisional.snapshot.stats.xp + xp } };

    // Concepts: sentence grammar on sentence errors; noun gender only when the article was wrong.
    const articleIssue = o.result?.issues.some((i) => i.kind === 'article') ?? false;
    const genderConcept = lang === 'fr' ? 'fr.articles' : `${lang}.gender`;
    let concepts = m.concepts;
    if (ex.t === 'recall') concepts = o.correct ? (articleIssue ? [genderConcept] : m.concepts) : articleIssue ? [genderConcept] : [];
    if (!o.correct && articleIssue && !concepts.includes(genderConcept) && (ex.t === 'translate' || ex.t === 'cloze')) {
      concepts = [...concepts, genderConcept];
    }
    const articleMissing = o.result?.issues.some((i) => i.kind === 'article' && !i.got);
    const quality = !isFirst ? 'retry' : o.usedHint || o.overridden ? 'assisted' : o.result?.verdict === 'almost' ? 'near' : 'exact';

    updateLang((p) => {
      let next = p;
      if (m.card && !o.selfAssessed) {
        // Retries are capped at Hard so a corrected mistake does not look like solid knowledge.
        next = applyReview(next, m.card.kind, m.card.itemId, (isFirst ? o.grade : Math.min(o.grade, 2)) as Grade, now, opts);
      }
      next = recordAttempt(next, {
        t: now,
        skill: m.skill!,
        correct: o.correct && !articleMissing,
        source: o.selfAssessed || o.selfRated ? 'self' : 'auto',
        quality,
        concepts: isFirst ? (articleMissing ? [genderConcept] : concepts) : [],
      });
      if (!o.correct && o.result && o.given) {
        const ex0 = { got: o.given, want: o.result.expected };
        for (const c of concepts) next = recordErrorExample(next, c, ex0);
      }
      if (xp) next = addXp(next, xp, now);
      next = addTime(next, secs, now);
      return next;
    }, lang);

    commit(result);
  };

  const exit = () => {
    const secs = tick();
    updateLang((p) => addTime(p, secs, Date.now()), lang);
    void flush();
    onExit();
  };

  if (snap.done || !ex || ex.t === 'recap') {
    return <Recap lang={lang} mode={mode} lessonId={lessonId} stats={snap.stats} missed={snap.missed} onClose={onExit} />;
  }

  return (
    <div className={`session lang-${lang}`}>
      <header className="session-head">
        <button className="icon-btn" onClick={exit} aria-label="Leave and save progress">
          <IconClose />
        </button>
        <Meter value={snap.pos / Math.max(1, total - 1)} label={`${title}: step ${snap.pos + 1} of ${total}`} />
        <span className="xp-chip" aria-label={`${snap.stats.xp} XP this session`}>{snap.stats.xp} XP</span>
      </header>
      <main className="session-body" key={`${snap.pos}-${total}`}>
        <ExerciseView lang={lang} ex={ex} onDone={onDone} recentErrors={recentErrors} />
      </main>
    </div>
  );
}

function describeItem(lang: LangCode, ex: Exercise): string | null {
  const idx = index(lang);
  if (ex.t === 'say') {
    if (ex.from === 'vocab') {
      const v = idx.vocabById.get(ex.id);
      return v ? `${productionForm(v)} — ${v.en}` : null;
    }
    const s = idx.sentenceById.get(ex.id);
    return s ? `${s.t} — ${s.en}` : null;
  }
  if ('vocabId' in ex) {
    const v = idx.vocabById.get(ex.vocabId);
    return v ? `${productionForm(v)} — ${v.en}` : null;
  }
  if ('sentenceId' in ex) {
    const s = idx.sentenceById.get(ex.sentenceId);
    return s ? `${s.t} — ${s.en}` : null;
  }
  return null;
}

function Recap({
  lang, mode, lessonId, stats, missed, onClose,
}: {
  lang: LangCode;
  mode: SessionMode;
  lessonId?: string;
  stats: { correct: number; answered: number; xp: number; finalCorrect: number; finalTotal: number };
  missed: string[];
  onClose: () => void;
}) {
  const { state } = useStore();
  const p = state.langs[lang];
  const lesson = lessonId ? index(lang).lessonById.get(lessonId) : undefined;
  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const nextDue = Object.values(p.cards).filter((c) => c.card.state !== 'new').map((c) => c.card.due).filter((d) => d > Date.now()).sort((a, b) => a - b)[0];
  const weakConcepts = Object.entries(p.errors)
    .filter(([, e]) => e.recent.some((t) => t > Date.now() - 3_600_000))
    .map(([c]) => conceptLabel(lang, c))
    .slice(0, 3);
  return (
    <div className={`session lang-${lang}`}>
      <main className="session-body recap">
        <p className="kicker">{mode === 'lesson' ? 'Lesson complete' : 'Session complete'}</p>
        <h2 className="display">{lesson ? lesson.title : mode === 'review' ? 'Review done' : 'Practice done'}</h2>
        <div className="recap-stats">
          <div><strong>{acc}%</strong><span>right first time</span></div>
          {stats.finalTotal > 0 && <div><strong>{stats.finalCorrect}/{stats.finalTotal}</strong><span>final check</span></div>}
          <div><strong>{stats.xp}</strong><span>XP</span></div>
        </div>
        {lesson && (
          <section>
            <h3>What you practised</h3>
            <ul className="word-list">
              {lesson.vocab.map((v) => (
                <li key={v.id}><span className="target">{productionForm(v)}</span> <span className="muted">{v.en}</span></li>
              ))}
            </ul>
          </section>
        )}
        {missed.length > 0 && (
          <section>
            <h3>Worth another look</h3>
            <ul className="word-list">{missed.slice(0, 8).map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="muted small">These will come back sooner in your reviews.</p>
          </section>
        )}
        {weakConcepts.length > 0 && <p className="muted">Grammar to keep an eye on: {weakConcepts.join(', ')}.</p>}
        <p className="muted small">
          {nextDue ? `Your next review is due in about ${formatInterval(nextDue - Date.now())}. ` : ''}
          Completing a lesson means you have met this material — your reviews over the coming days are what make it stick.
        </p>
        <button className="btn primary wide" onClick={onClose} autoFocus>Done</button>
        <p className="muted small center">{COURSES[lang].name}</p>
      </main>
    </div>
  );
}

