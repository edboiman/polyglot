/**
 * Derived measures: skill mastery, retention estimates, workload, streaks
 * and grammar weaknesses. All thresholds are documented constants so the
 * learner (and developers) can see why a label appears.
 */

import { currentRetrievability, maturity, MS } from './fsrs';
import { type AppState, type LangProgress, type Skill, SKILLS, dayKey } from './model';

/* ---------------------------------------------------------------- mastery */

export type MasteryLevel = 'not-started' | 'developing' | 'proficient' | 'mastered';

/**
 * Mastery rules (applied per skill, to automatically graded first attempts;
 * self-assessed answers and retries never count, and only exact, unaided
 * answers count as accurate — near misses, hints and overrides do not):
 *  - developing: at least 5 attempts
 *  - proficient: ≥ 20 attempts, ≥ 80% correct over the last 30, on ≥ 2 days
 *  - mastered:   ≥ 40 attempts, ≥ 90% correct over the last 30, on ≥ 3 days
 * "Mastered" here means "mastered the material studied so far", never a
 * CEFR level.
 */
export const MASTERY_RULES = {
  developing: { attempts: 5 },
  proficient: { attempts: 20, accuracy: 0.8, days: 2 },
  mastered: { attempts: 40, accuracy: 0.9, days: 3 },
  window: 30,
};

export interface SkillSummary {
  skill: Skill;
  attempts: number;
  recentAccuracy: number | null;
  days: number;
  level: MasteryLevel;
}

/** An attempt counts as accurate only when it was right, unaided and not a near miss. */
export function accurate(a: { correct: boolean; quality?: string }): boolean {
  return a.correct && (a.quality === undefined || a.quality === 'exact');
}

export function skillSummary(p: LangProgress, skill: Skill): SkillSummary {
  const all = p.attempts.filter((a) => a.skill === skill && a.source !== 'self' && a.quality !== 'retry');
  const recent = all.slice(-MASTERY_RULES.window);
  const acc = recent.length ? recent.filter(accurate).length / recent.length : null;
  const days = new Set(all.map((a) => dayKey(a.t))).size;
  let level: MasteryLevel = 'not-started';
  const R = MASTERY_RULES;
  if (all.length >= R.developing.attempts) level = 'developing';
  if (acc !== null && all.length >= R.proficient.attempts && acc >= R.proficient.accuracy && days >= R.proficient.days) level = 'proficient';
  if (acc !== null && all.length >= R.mastered.attempts && acc >= R.mastered.accuracy && days >= R.mastered.days) level = 'mastered';
  return { skill, attempts: all.length, recentAccuracy: acc, days, level };
}

export function allSkills(p: LangProgress): SkillSummary[] {
  return SKILLS.map((s) => skillSummary(p, s));
}

/* -------------------------------------------------------------- retention */

export interface RetentionSummary {
  /** Mean predicted recall probability over studied cards (model estimate). */
  estimated: number | null;
  /** Share of scheduled (due) reviews answered correctly in the last 30 days (observed). */
  observed: number | null;
  observedCount: number;
  counts: { learning: number; young: number; mature: number };
  studiedItems: number;
}

export function retention(p: LangProgress, now: number): RetentionSummary {
  const cards = Object.values(p.cards).filter((c) => c.card.state !== 'new');
  const counts = { learning: 0, young: 0, mature: 0 };
  let sum = 0;
  for (const c of cards) {
    const m = maturity(c.card);
    if (m === 'learning') counts.learning++;
    else if (m === 'young') counts.young++;
    else if (m === 'mature') counts.mature++;
    sum += currentRetrievability(c.card, now);
  }
  const since = now - 30 * MS.DAY;
  const dueReviews = p.reviewLog.filter((r) => r.due && r.t >= since);
  const ok = dueReviews.filter((r) => r.grade > 1).length;
  const items = new Set(cards.map((c) => c.itemId)).size;
  return {
    estimated: cards.length ? sum / cards.length : null,
    observed: dueReviews.length ? ok / dueReviews.length : null,
    observedCount: dueReviews.length,
    counts,
    studiedItems: items,
  };
}

/** Weekly accuracy on scheduled reviews (observed), oldest first. */
export function weeklyAccuracy(p: LangProgress, now: number, weeks = 8): { label: string; accuracy: number | null; n: number }[] {
  const out: { label: string; accuracy: number | null; n: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now - w * 7 * MS.DAY;
    const start = end - 7 * MS.DAY;
    const rs = p.reviewLog.filter((r) => r.t >= start && r.t < end);
    const n = rs.length;
    out.push({
      label: w === 0 ? 'This wk' : `-${w}w`,
      accuracy: n ? rs.filter((r) => r.grade > 1).length / n : null,
      n,
    });
  }
  return out;
}

/* --------------------------------------------------------------- workload */

/** Studied cards whose due date has passed, plus words the learner saved for review. */
export function dueCards(p: LangProgress, now: number) {
  return Object.values(p.cards).filter((c) => (c.card.state !== 'new' || c.saved) && c.card.due <= now);
}

/** Number of reviews expected on each of the next `days` days. */
export function forecast(p: LangProgress, now: number, days = 7): number[] {
  const out = new Array(days).fill(0);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const base = startOfToday.getTime();
  for (const c of Object.values(p.cards)) {
    if (c.card.state === 'new') continue;
    const idx = Math.floor((c.card.due - base) / MS.DAY);
    out[Math.max(0, Math.min(days - 1, idx))] += idx < days ? 1 : 0;
  }
  return out;
}

/** Scheduled reviews completed today (all languages' logs are separate). */
export function reviewsDoneToday(p: LangProgress, now: number): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return p.reviewLog.filter((r) => r.due && r.t >= start.getTime()).length;
}

/**
 * Today's review budget. `maxReviewsPerDay` is a cap: once reached, Home,
 * Practice and Review all stop offering due reviews until tomorrow.
 */
export function reviewBudget(p: LangProgress, maxPerDay: number, now: number) {
  const due = dueCards(p, now).length;
  const done = reviewsDoneToday(p, now);
  const remaining = Math.max(0, maxPerDay - done);
  return { due, done, remaining, available: Math.min(due, remaining) };
}

/** Cards with the most lapses or lowest stability — "difficult words". */
export function difficultCards(p: LangProgress, limit = 20) {
  return Object.values(p.cards)
    .filter((c) => c.card.state !== 'new' && (c.card.lapses > 0 || c.card.difficulty >= 7))
    .sort((a, b) => b.card.lapses - a.card.lapses || b.card.difficulty - a.card.difficulty)
    .slice(0, limit);
}

/* ------------------------------------------------------------- weaknesses */

/**
 * A grammar concept is a weakness when, within the last 14 days, the learner
 * made ≥ 3 errors on it AND errors outnumber correct answers... unless at
 * least 5 later correct answers show it has been fixed.
 */
export const WEAKNESS_RULE = { windowDays: 14, minErrors: 3, resolvedAfterCorrect: 5 };

export interface Weakness {
  concept: string;
  errors: number;
  correct: number;
  lastExample?: { got: string; want: string; prompt?: string };
}

export function weaknesses(p: LangProgress, now: number): Weakness[] {
  const since = now - WEAKNESS_RULE.windowDays * MS.DAY;
  const out: Weakness[] = [];
  for (const [concept, e] of Object.entries(p.errors)) {
    const errs = e.recent.filter((t) => t >= since);
    if (errs.length < WEAKNESS_RULE.minErrors) continue;
    const lastErr = Math.max(...errs);
    const correctAfter = e.recentCorrect.filter((t) => t > lastErr).length;
    if (correctAfter >= WEAKNESS_RULE.resolvedAfterCorrect) continue;
    const correctInWindow = e.recentCorrect.filter((t) => t >= since).length;
    if (errs.length < correctInWindow * 0.5) continue; // mostly right; isolated slips
    out.push({ concept, errors: errs.length, correct: correctInWindow, lastExample: e.lastExample });
  }
  return out.sort((a, b) => b.errors - a.errors);
}

/* ------------------------------------------------------------ streak / xp */

export function totalForDay(state: AppState, key: string) {
  let xp = 0;
  let seconds = 0;
  for (const l of Object.values(state.langs)) {
    const d = l.daily[key];
    if (d) {
      xp += d.xp;
      seconds += d.seconds;
    }
  }
  return { xp, seconds };
}

/**
 * Streak with a built-in, automatic rest day: one missed day per rolling
 * 7 days does not break the streak. There is nothing to buy and no warning
 * notifications — streaks can be switched off entirely in Profile.
 */
export function streak(state: AppState, now: number): { days: number; activeToday: boolean } {
  const active = (t: number) => totalForDay(state, dayKey(t)).xp > 0;
  const activeToday = active(now);
  let days = 0;
  let restUsedAt = -Infinity;
  let i = activeToday ? 0 : 1;
  for (; i < 3650; i++) {
    const t = now - i * MS.DAY;
    if (active(t)) {
      days++;
    } else if (i - restUsedAt >= 7 && days > 0 && active(t - MS.DAY)) {
      restUsedAt = i; // forgiven rest day
    } else {
      break;
    }
  }
  return { days, activeToday };
}

export function lastNDays(state: AppState, now: number, n: number) {
  const out: { key: string; date: Date; xp: number; seconds: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * MS.DAY;
    const key = dayKey(t);
    out.push({ key, date: new Date(t), ...totalForDay(state, key) });
  }
  return out;
}

export function langTotals(p: LangProgress) {
  let seconds = 0;
  let reviews = 0;
  let xp = 0;
  for (const d of Object.values(p.daily)) {
    seconds += d.seconds;
    reviews += d.reviews;
    xp += d.xp;
  }
  return {
    seconds,
    reviews,
    xp,
    lessons: Object.values(p.lessons).filter((l) => l.completedAt).length,
    vocab: new Set(Object.values(p.cards).filter((c) => c.kind !== 's').map((c) => c.itemId)).size,
  };
}
