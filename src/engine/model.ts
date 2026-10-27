/**
 * Learner model: the persistent record of what a learner has practised and
 * how they performed. Every update is a pure function of (state, event) so
 * it can be tested without a browser.
 */

import type { LangCode } from '../data/types';
import { type Grade, type MemoryCard, type SchedulerOptions, DEFAULT_OPTIONS, newCard, review } from './fsrs';

export type Skill =
  | 'vocabRecognition'
  | 'vocabProduction'
  | 'listening'
  | 'reading'
  | 'grammar'
  | 'writing'
  | 'speaking';

export const SKILLS: Skill[] = [
  'vocabRecognition',
  'vocabProduction',
  'listening',
  'reading',
  'grammar',
  'writing',
  'speaking',
];

export const SKILL_LABEL: Record<Skill, string> = {
  vocabRecognition: 'Vocabulary recognition',
  vocabProduction: 'Vocabulary production',
  listening: 'Listening comprehension',
  reading: 'Reading comprehension',
  grammar: 'Grammar application',
  writing: 'Writing',
  speaking: 'Speaking',
};

/** Card kinds: r = recognise (target→English), p = produce (English→target), s = sentence. */
export type CardKind = 'r' | 'p' | 's';

export interface CardRecord {
  id: string; // `${kind}:${itemId}`
  itemId: string;
  kind: CardKind;
  card: MemoryCard;
  introduced: number;
  /** True when the learner saved it from a story or flagged it. */
  saved?: boolean;
}

export interface ReviewEntry {
  t: number;
  cardId: string;
  grade: Grade;
  /** Was this review due (scheduled) rather than a learning-step repeat? */
  due: boolean;
}

export interface Attempt {
  t: number;
  skill: Skill;
  correct: boolean;
  /** 'self' = learner self-assessed (not counted toward mastery). */
  source?: 'auto' | 'self';
  /**
   * How the answer was produced: exact (unaided and fully right), near
   * (accepted with a spelling/accent note), assisted (hint, transcript or
   * learner override), retry (second try after a correction).
   * Only exact answers count as accurate for mastery; retries are ignored.
   */
  quality?: 'exact' | 'near' | 'assisted' | 'retry';
  concepts?: string[];
}

export interface ErrorStat {
  /** Timestamps of recent errors for this concept (capped). */
  recent: number[];
  /** Timestamps of recent correct answers for this concept (capped). */
  recentCorrect: number[];
  total: number;
  lastExample?: { got: string; want: string; prompt?: string };
}

export interface LessonRecord {
  completedAt?: number;
  bestScore: number;
  attempts: number;
}

export interface DayStat {
  xp: number;
  seconds: number;
  reviews: number;
  lessons: number;
  correct: number;
  answered: number;
}

export interface LessonResume {
  lessonId: string;
  /** Full session snapshot (see engine/sessionState.ts); validated before use. */
  snapshot?: unknown;
  startedAt: number;
  savedAt: number;
  /** Legacy (v1.0) fields: position and queue only. */
  step?: number;
  queue?: unknown[];
  correct?: number;
  answered?: number;
}

export interface LangProgress {
  lang: LangCode;
  cards: Record<string, CardRecord>;
  reviewLog: ReviewEntry[];
  attempts: Attempt[];
  lessons: Record<string, LessonRecord>;
  resume?: LessonResume;
  errors: Record<string, ErrorStat>;
  grammarDone: Record<string, { best: number; at: number }>;
  conversationsDone: Record<string, number>;
  storiesRead: Record<string, { score: number; at: number }>;
  daily: Record<string, DayStat>;
  newIntroduced: { date: string; count: number };
}

export interface Settings {
  dailyGoalXp: number;
  newPerDay: number;
  maxReviewsPerDay: number;
  desiredRetention: number;
  theme: 'system' | 'light' | 'dark';
  fontScale: number;
  reduceMotion: boolean;
  streaks: boolean;
  autoplayAudio: boolean;
  speechRate: number;
  voiceURI: Record<LangCode, string>;
  microphone: boolean;
  showTranslations: 'always' | 'tap' | 'never';
  /** keyEndpoint: the endpoint the API key was entered for; the key is never sent anywhere else. */
  ai: { enabled: boolean; endpoint: string; model: string; apiKey: string; keyEndpoint: string };
  /** Let the learner open any lesson instead of following the sequence. */
  freeNavigation: boolean;
  /** Include typed answers. Off by default: answers are spoken or chosen. */
  typing: boolean;
  onboarded: boolean;
}

export interface AppState {
  schemaVersion: number;
  createdAt: number;
  currentLang: LangCode;
  settings: Settings;
  langs: Record<LangCode, LangProgress>;
  badges: Record<string, number>;
  /** Incremented on every save; used to detect writes from another tab. */
  revision?: number;
}

export const SCHEMA_VERSION = 2;
const LOG_CAP = 4000;
const ATTEMPT_CAP = 4000;
const ERR_CAP = 30;

export function defaultSettings(): Settings {
  return {
    dailyGoalXp: 50,
    newPerDay: 10,
    maxReviewsPerDay: 100,
    desiredRetention: 0.9,
    theme: 'system',
    fontScale: 1,
    reduceMotion: false,
    streaks: true,
    autoplayAudio: true,
    speechRate: 1,
    voiceURI: { es: '', de: '', fr: '' },
    microphone: true,
    showTranslations: 'tap',
    ai: { enabled: false, endpoint: '', model: '', apiKey: '', keyEndpoint: '' },
    freeNavigation: false,
    typing: false,
    onboarded: false,
  };
}

export function emptyLang(lang: LangCode): LangProgress {
  return {
    lang,
    cards: {},
    reviewLog: [],
    attempts: [],
    lessons: {},
    errors: {},
    grammarDone: {},
    conversationsDone: {},
    storiesRead: {},
    daily: {},
    newIntroduced: { date: '', count: 0 },
  };
}

export function initialState(now = Date.now()): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    currentLang: 'es',
    settings: defaultSettings(),
    langs: { es: emptyLang('es'), de: emptyLang('de'), fr: emptyLang('fr') },
    badges: {},
  };
}

export function dayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function cardId(kind: CardKind, itemId: string) {
  return `${kind}:${itemId}`;
}

export function schedulerOptions(s: Settings): SchedulerOptions {
  return { ...DEFAULT_OPTIONS, desiredRetention: s.desiredRetention };
}

function day(p: LangProgress, t: number): DayStat {
  const k = dayKey(t);
  return p.daily[k] ?? { xp: 0, seconds: 0, reviews: 0, lessons: 0, correct: 0, answered: 0 };
}

function withDay(p: LangProgress, t: number, f: (d: DayStat) => DayStat): LangProgress {
  return { ...p, daily: { ...p.daily, [dayKey(t)]: f(day(p, t)) } };
}

/** Add a card if missing (does not change an existing one). */
export function ensureCard(p: LangProgress, kind: CardKind, itemId: string, t: number, saved = false): LangProgress {
  const id = cardId(kind, itemId);
  if (p.cards[id]) {
    if (saved && !p.cards[id].saved) return { ...p, cards: { ...p.cards, [id]: { ...p.cards[id], saved: true } } };
    return p;
  }
  return { ...p, cards: { ...p.cards, [id]: { id, itemId, kind, card: newCard(t), introduced: t, saved } } };
}

/** Apply a graded retrieval to a card, creating it if needed. */
export function applyReview(p: LangProgress, kind: CardKind, itemId: string, grade: Grade, t: number, opts: SchedulerOptions): LangProgress {
  let next = ensureCard(p, kind, itemId, t);
  const id = cardId(kind, itemId);
  const rec = next.cards[id];
  // Any studied card whose due time has passed counts as scheduled work
  // (review, learning and relearning alike), matching what review sessions show.
  const wasDue = rec.card.state !== 'new' && rec.card.due <= t;
  const updated = review(rec.card, grade, t, opts);
  next = {
    ...next,
    cards: { ...next.cards, [id]: { ...rec, card: updated } },
    reviewLog: [...next.reviewLog, { t, cardId: id, grade, due: wasDue }].slice(-LOG_CAP),
  };
  if (wasDue) next = withDay(next, t, (d) => ({ ...d, reviews: d.reviews + 1 }));
  return next;
}

export function recordAttempt(p: LangProgress, a: Attempt): LangProgress {
  let next: LangProgress = { ...p, attempts: [...p.attempts, a].slice(-ATTEMPT_CAP) };
  if (a.source !== 'self') {
    next = withDay(next, a.t, (d) => ({ ...d, answered: d.answered + 1, correct: d.correct + (a.correct ? 1 : 0) }));
  }
  if (a.concepts?.length) {
    const errors = { ...next.errors };
    for (const c of a.concepts) {
      const e = errors[c] ?? { recent: [], recentCorrect: [], total: 0 };
      errors[c] = a.correct
        ? { ...e, recentCorrect: [...e.recentCorrect, a.t].slice(-ERR_CAP) }
        : { ...e, recent: [...e.recent, a.t].slice(-ERR_CAP), total: e.total + 1 };
    }
    next = { ...next, errors };
  }
  return next;
}

export function recordErrorExample(p: LangProgress, concept: string, ex: { got: string; want: string; prompt?: string }): LangProgress {
  const e = p.errors[concept];
  if (!e) return p;
  return { ...p, errors: { ...p.errors, [concept]: { ...e, lastExample: ex } } };
}

export function addXp(p: LangProgress, xp: number, t: number): LangProgress {
  return withDay(p, t, (d) => ({ ...d, xp: d.xp + xp }));
}

export function addTime(p: LangProgress, seconds: number, t: number): LangProgress {
  return withDay(p, t, (d) => ({ ...d, seconds: d.seconds + Math.max(0, Math.round(seconds)) }));
}

export function completeLesson(p: LangProgress, lessonId: string, score: number, t: number): LangProgress {
  const prev = p.lessons[lessonId] ?? { bestScore: 0, attempts: 0 };
  const firstTime = !prev.completedAt;
  let next: LangProgress = {
    ...p,
    resume: undefined,
    lessons: {
      ...p.lessons,
      [lessonId]: { completedAt: prev.completedAt ?? t, bestScore: Math.max(prev.bestScore, score), attempts: prev.attempts + 1 },
    },
  };
  if (firstTime) next = withDay(next, t, (d) => ({ ...d, lessons: d.lessons + 1 }));
  return next;
}

export function countNewToday(p: LangProgress, t: number): number {
  return p.newIntroduced.date === dayKey(t) ? p.newIntroduced.count : 0;
}

export function noteNewIntroduced(p: LangProgress, n: number, t: number): LangProgress {
  const k = dayKey(t);
  const count = (p.newIntroduced.date === k ? p.newIntroduced.count : 0) + n;
  return { ...p, newIntroduced: { date: k, count } };
}
