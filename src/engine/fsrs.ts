/**
 * FSRS-5 spaced-repetition scheduler (Free Spaced Repetition Scheduler).
 *
 * Model: each card has a memory Stability S (days until recall probability
 * falls to 90%) and a Difficulty D (1–10). Recall probability after t days is
 *
 *     R(t, S) = (1 + FACTOR · t / S) ^ DECAY,   DECAY = -0.5, FACTOR = 19/81
 *
 * After each review the learner's grade (1 Again, 2 Hard, 3 Good, 4 Easy)
 * updates S and D with the published FSRS-5 equations, and the next interval
 * is the time at which R is predicted to drop to the desired retention.
 *
 * Default weights are the published FSRS-5 defaults, fitted on a large body
 * of real review logs. They are a sound starting point; per-user optimisation
 * is listed as a future enhancement (see docs/LEARNING_SCIENCE.md).
 */

export type Grade = 1 | 2 | 3 | 4;
export const AGAIN: Grade = 1;
export const HARD: Grade = 2;
export const GOOD: Grade = 3;
export const EASY: Grade = 4;

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface MemoryCard {
  stability: number; // days
  difficulty: number; // 1..10
  state: CardState;
  reps: number;
  lapses: number;
  /** Epoch ms of the last review, 0 if never reviewed. */
  lastReview: number;
  /** Epoch ms when the card is next due. */
  due: number;
}

export const DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
  0.6621,
];

export const DECAY = -0.5;
export const FACTOR = 19 / 81;
const DAY = 86_400_000;
const MIN = 60_000;

export interface SchedulerOptions {
  desiredRetention: number; // 0.7 – 0.97
  maximumInterval: number; // days
  weights: readonly number[];
}

export const DEFAULT_OPTIONS: SchedulerOptions = {
  desiredRetention: 0.9,
  maximumInterval: 365,
  weights: DEFAULT_WEIGHTS,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function newCard(now: number): MemoryCard {
  return {
    stability: 0,
    difficulty: 0,
    state: 'new',
    reps: 0,
    lapses: 0,
    lastReview: 0,
    due: now,
  };
}

/** Probability of recall `elapsedDays` after the last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function currentRetrievability(card: MemoryCard, now: number): number {
  if (card.state === 'new' || card.lastReview === 0) return 0;
  return retrievability((now - card.lastReview) / DAY, card.stability);
}

/** Interval (days) at which R falls to `desiredRetention` for stability S. */
export function intervalForStability(stability: number, opts: SchedulerOptions = DEFAULT_OPTIONS): number {
  const raw = (stability / FACTOR) * (Math.pow(opts.desiredRetention, 1 / DECAY) - 1);
  return clamp(raw, 1 / 1440, opts.maximumInterval);
}

function initStability(g: Grade, w: readonly number[]) {
  return Math.max(w[g - 1], 0.1);
}

function initDifficulty(g: Grade, w: readonly number[]) {
  return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);
}

function nextDifficulty(d: number, g: Grade, w: readonly number[]) {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // linear damping near the ceiling
  const reverted = w[7] * initDifficulty(EASY, w) + (1 - w[7]) * damped; // mean reversion
  return clamp(reverted, 1, 10);
}

function stabilityAfterRecall(d: number, s: number, r: number, g: Grade, w: readonly number[]) {
  const hardPenalty = g === HARD ? w[15] : 1;
  const easyBonus = g === EASY ? w[16] : 1;
  return (
    s *
    (1 +
      Math.exp(w[8]) *
        (11 - d) *
        Math.pow(s, -w[9]) *
        (Math.exp(w[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function stabilityAfterLapse(d: number, s: number, r: number, w: readonly number[]) {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(sf, s);
}

function shortTermStability(s: number, g: Grade, w: readonly number[]) {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

/**
 * Apply a review. Pure function: returns the updated card.
 *
 * Learning steps: a new or lapsed card answered Again/Hard comes back within
 * the same session (minutes); Good/Easy graduates it to day-based intervals.
 */
export function review(card: MemoryCard, grade: Grade, now: number, opts: SchedulerOptions = DEFAULT_OPTIONS): MemoryCard {
  const w = opts.weights;
  const next: MemoryCard = { ...card, reps: card.reps + 1, lastReview: now };

  if (card.state === 'new') {
    next.stability = initStability(grade, w);
    next.difficulty = initDifficulty(grade, w);
  } else {
    const elapsedDays = Math.max(0, (now - card.lastReview) / DAY);
    const r = retrievability(elapsedDays, card.stability);
    next.difficulty = nextDifficulty(card.difficulty, grade, w);
    if (elapsedDays < 1) {
      // Same-day review: FSRS-5 short-term stability update.
      next.stability = Math.max(0.05, shortTermStability(card.stability, grade, w));
    } else if (grade === AGAIN) {
      next.stability = Math.max(0.05, stabilityAfterLapse(card.difficulty, card.stability, r, w));
    } else {
      next.stability = stabilityAfterRecall(card.difficulty, card.stability, r, grade, w);
    }
  }

  if (grade === AGAIN) {
    if (card.state === 'review') next.lapses = card.lapses + 1;
    next.state = card.state === 'review' || card.state === 'relearning' ? 'relearning' : 'learning';
    next.due = now + 5 * MIN;
  } else if (grade === HARD && (card.state === 'new' || card.state === 'learning' || card.state === 'relearning')) {
    next.state = card.state === 'new' ? 'learning' : card.state;
    next.due = now + 10 * MIN;
  } else {
    next.state = 'review';
    // Day-granular intervals, at least one day once graduated.
    const days = Math.max(1, Math.round(intervalForStability(next.stability, opts)));
    next.due = now + days * DAY;
  }
  return next;
}

/** True when the card is due at `now`. */
export function isDue(card: MemoryCard, now: number): boolean {
  return card.state !== 'new' && card.due <= now;
}

/**
 * "Mature" follows the common convention of an interval of 21+ days; such
 * items count as long-term knowledge, younger ones as recently learned.
 */
export function maturity(card: MemoryCard): 'new' | 'learning' | 'young' | 'mature' {
  if (card.state === 'new') return 'new';
  if (card.state === 'learning' || card.state === 'relearning') return 'learning';
  return card.stability >= 21 ? 'mature' : 'young';
}

/** Human-readable interval, e.g. "10 min", "3 d", "2 mo". */
export function formatInterval(ms: number): string {
  if (ms < 0) return 'now';
  const m = ms / MIN;
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} d`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo)} mo`;
  return `${(d / 365).toFixed(1)} y`;
}

export const MS = { DAY, MIN };
