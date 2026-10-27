/**
 * Pure session state for lessons, reviews and practice sets.
 *
 * Everything the runner needs to continue a session — queue, position,
 * scores, which items were already answered (so rewards are not repeated)
 * and which were already re-queued — lives in one serialisable snapshot.
 * The runner saves this snapshot for resuming, and computes completion
 * from the snapshot that *includes* the final answer.
 */

import type { Exercise } from './session';

export interface SessionStats {
  /** First-attempt answers that were right. */
  correct: number;
  /** First-attempt answers. */
  answered: number;
  xp: number;
  finalCorrect: number;
  finalTotal: number;
}

export interface SessionSnapshot {
  version: 1;
  queue: Exercise[];
  pos: number;
  stats: SessionStats;
  /** Keys of exercises already answered at least once. */
  answeredKeys: string[];
  /** Number of times each exercise key has been re-queued. */
  requeued: Record<string, number>;
  missed: string[];
  done: boolean;
}

export const exerciseKey = (e: Exercise) => JSON.stringify(e);

export function initSession(queue: Exercise[], pos = 0): SessionSnapshot {
  return {
    version: 1,
    queue,
    pos,
    stats: { correct: 0, answered: 0, xp: 0, finalCorrect: 0, finalTotal: 0 },
    answeredKeys: [],
    requeued: {},
    missed: [],
    done: false,
  };
}

/** Is the next step the end of the session? */
function atEnd(queue: Exercise[], pos: number) {
  return pos >= queue.length || queue[pos]?.t === 'recap';
}

/** Move past a non-graded or skipped step. */
export function skipStep(s: SessionSnapshot): SessionSnapshot {
  const pos = s.pos + 1;
  return { ...s, pos, done: atEnd(s.queue, pos) };
}

export interface AnswerInput {
  correct: boolean;
  xp: number;
  /** Label for the recap's "worth another look" list. */
  label?: string | null;
  /** Lesson mode enables re-showing a word card before a missed recall. */
  lesson: boolean;
  /** Typed answers enabled (a missed choice returns as typed recall); otherwise it returns as the same choice. */
  typing?: boolean;
}

export interface AnswerResult {
  snapshot: SessionSnapshot;
  /** First time this exercise was answered in the session. */
  isFirst: boolean;
}

/** Apply a graded answer to the current step and advance. */
export function answerStep(s: SessionSnapshot, input: AnswerInput): AnswerResult {
  const ex = s.queue[s.pos];
  const key = exerciseKey(ex);
  const isFirst = !s.answeredKeys.includes(key);
  const final = 'final' in ex && !!ex.final;
  const stats: SessionStats = {
    correct: s.stats.correct + (isFirst && input.correct ? 1 : 0),
    answered: s.stats.answered + (isFirst ? 1 : 0),
    xp: s.stats.xp + input.xp,
    finalCorrect: s.stats.finalCorrect + (isFirst && final && input.correct ? 1 : 0),
    finalTotal: s.stats.finalTotal + (isFirst && final ? 1 : 0),
  };
  let queue = s.queue;
  let requeued = s.requeued;
  let missed = s.missed;

  if (!input.correct) {
    if (input.label && !missed.includes(input.label)) missed = [...missed, input.label];
    const n = requeued[key] ?? 0;
    // Re-queue once, a few steps later. Final-check and speaking items are not repeated.
    if (!final && n < 1 && ex.t !== 'speak') {
      requeued = { ...requeued, [key]: n + 1 };
      const end = queue.length - (queue[queue.length - 1]?.t === 'recap' ? 1 : 0);
      const insertAt = Math.min(end, s.pos + 4);
      const extra: Exercise[] = [];
      if (input.lesson && ex.t === 'recall' && ex.dir === 'en2tl') extra.push({ t: 'present', vocabId: ex.vocabId });
      if (input.lesson && ex.t === 'say' && ex.from === 'vocab') extra.push({ t: 'present', vocabId: ex.id });
      // A missed multiple-choice item comes back as typed recall when typing is on, otherwise as the same choice.
      extra.push(ex.t === 'choice' && input.typing !== false ? { t: 'recall', dir: 'tl2en', vocabId: ex.vocabId, hints: false } : ex);
      queue = [...queue.slice(0, insertAt), ...extra, ...queue.slice(insertAt)];
    }
  }

  // Adaptation: six right first answers in a lesson skip the remaining multiple choice.
  if (input.lesson && stats.answered === 6 && stats.correct === 6 && isFirst) {
    queue = [...queue.slice(0, s.pos + 1), ...queue.slice(s.pos + 1).filter((e) => !(e.t === 'choice' && !e.final && !e.review))];
  }

  const pos = s.pos + 1;
  return {
    snapshot: {
      ...s,
      queue,
      pos,
      stats,
      answeredKeys: isFirst ? [...s.answeredKeys, key] : s.answeredKeys,
      requeued,
      missed,
      done: atEnd(queue, pos),
    },
    isFirst,
  };
}

/**
 * Lesson score saved on completion: share of first attempts that were right.
 * A session with no graded answers scores 0, never a default 100%.
 */
export function sessionScore(stats: SessionStats): number {
  return stats.answered ? stats.correct / stats.answered : 0;
}

/** Validate a snapshot read from storage; returns null if it cannot be resumed. */
export function readSnapshot(raw: unknown, isValidExercise: (e: unknown) => boolean): SessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SessionSnapshot>;
  if (r.version !== 1 || !Array.isArray(r.queue) || !r.queue.every(isValidExercise)) return null;
  if (typeof r.pos !== 'number' || !Number.isInteger(r.pos) || r.pos < 0 || r.pos >= r.queue.length) return null;
  const st = r.stats;
  const nums = st && ['correct', 'answered', 'xp', 'finalCorrect', 'finalTotal'].every((k) => {
    const v = (st as unknown as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  });
  if (!nums || st!.correct > st!.answered) return null;
  if (!Array.isArray(r.answeredKeys) || !r.answeredKeys.every((k) => typeof k === 'string')) return null;
  if (!r.requeued || typeof r.requeued !== 'object') return null;
  if (!Array.isArray(r.missed)) return null;
  return { ...(r as SessionSnapshot), done: false };
}
