/**
 * Runtime validation of stored and imported learner data.
 *
 * Settings are *repaired* (an invalid value falls back to its default, which
 * loses nothing important). Progress data is *validated*: a malformed
 * collection is reported as an error so the caller can refuse the import or
 * quarantine the data instead of loading something that breaks the app.
 */

import type { LangCode } from '../data/types';
import { index } from '../data/courses';
import { type AppState, type LangProgress, type Settings, SKILLS, defaultSettings, emptyLang } from '../engine/model';

type Json = Record<string, unknown>;

export const LANG_CODES: LangCode[] = ['es', 'de', 'fr'];
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 50_000;
const MAX_TIME = Date.UTC(2200, 0, 1);

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown, lo = -Infinity, hi = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = (v: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): v is number => isNum(v, lo, hi) && Number.isInteger(v);
const isTime = (v: unknown) => isNum(v, 0, MAX_TIME);
const isStr = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;

export class ValidationError extends Error {
  constructor(public problems: string[]) {
    super(problems.slice(0, 3).join(' '));
  }
}

/* ------------------------------------------------------------ settings */

function pick<T>(v: unknown, ok: (x: unknown) => boolean, fallback: T): T {
  return ok(v) ? (v as T) : fallback;
}

export function repairSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const s = isObj(raw) ? raw : {};
  const ai = isObj(s.ai) ? s.ai : {};
  const vo = isObj(s.voiceURI) ? s.voiceURI : {};
  return {
    dailyGoalXp: pick(s.dailyGoalXp, (x) => isInt(x, 5, 1000), d.dailyGoalXp),
    newPerDay: pick(s.newPerDay, (x) => isInt(x, 1, 200), d.newPerDay),
    maxReviewsPerDay: pick(s.maxReviewsPerDay, (x) => isInt(x, 1, 100_000), d.maxReviewsPerDay),
    desiredRetention: pick(s.desiredRetention, (x) => isNum(x, 0.7, 0.97), d.desiredRetention),
    theme: pick(s.theme, (x) => x === 'system' || x === 'light' || x === 'dark', d.theme),
    fontScale: pick(s.fontScale, (x) => isNum(x, 0.8, 1.6), d.fontScale),
    reduceMotion: pick(s.reduceMotion, (x) => typeof x === 'boolean', d.reduceMotion),
    streaks: pick(s.streaks, (x) => typeof x === 'boolean', d.streaks),
    autoplayAudio: pick(s.autoplayAudio, (x) => typeof x === 'boolean', d.autoplayAudio),
    speechRate: pick(s.speechRate, (x) => isNum(x, 0.5, 2), d.speechRate),
    voiceURI: {
      es: pick(vo.es, (x) => isStr(x), ''),
      de: pick(vo.de, (x) => isStr(x), ''),
      fr: pick(vo.fr, (x) => isStr(x), ''),
    },
    microphone: pick(s.microphone, (x) => typeof x === 'boolean', d.microphone),
    showTranslations: pick(s.showTranslations, (x) => x === 'always' || x === 'tap' || x === 'never', d.showTranslations),
    ai: {
      enabled: pick(ai.enabled, (x) => typeof x === 'boolean', false),
      endpoint: pick(ai.endpoint, (x) => isStr(x, 2000), ''),
      model: pick(ai.model, (x) => isStr(x, 200), ''),
      apiKey: pick(ai.apiKey, (x) => isStr(x, 2000), ''),
      keyEndpoint: pick(ai.keyEndpoint, (x) => isStr(x, 2000), ''),
    },
    freeNavigation: pick(s.freeNavigation, (x) => typeof x === 'boolean', d.freeNavigation),
    typing: pick(s.typing, (x) => typeof x === 'boolean', d.typing),
    onboarded: pick(s.onboarded, (x) => typeof x === 'boolean', d.onboarded),
  };
}

/* ------------------------------------------------------------ progress */

const STATES = new Set(['new', 'learning', 'review', 'relearning']);
const KINDS = new Set(['r', 'p', 's']);
const SKILL_SET = new Set<string>(SKILLS);

interface LangCheck {
  progress: LangProgress;
  problems: string[];
  /** Cards dropped because their word or sentence no longer exists in the course. */
  dropped: number;
}

function checkRecord<T>(v: unknown, name: string, each: (x: unknown) => boolean, problems: string[]): Record<string, T> {
  if (v === undefined) return {};
  if (!isObj(v)) {
    problems.push(`${name} is not a collection.`);
    return {};
  }
  const keys = Object.keys(v);
  if (keys.length > MAX_ITEMS) problems.push(`${name} is too large.`);
  for (const k of keys) {
    if (!each(v[k])) {
      problems.push(`${name} contains an invalid entry (${k.slice(0, 40)}).`);
      break;
    }
  }
  return v as Record<string, T>;
}

function checkArray<T>(v: unknown, name: string, each: (x: unknown) => boolean, problems: string[]): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    problems.push(`${name} is not a list.`);
    return [];
  }
  if (v.length > MAX_ITEMS) problems.push(`${name} is too large.`);
  const bad = v.findIndex((x) => !each(x));
  if (bad !== -1) problems.push(`${name} contains an invalid entry (#${bad + 1}).`);
  return v as T[];
}

const numList = (x: unknown) => Array.isArray(x) && x.length <= 1000 && x.every(isTime);

function validCard(x: unknown): boolean {
  if (!isObj(x) || !isObj(x.card)) return false;
  const c = x.card;
  return (
    isStr(x.id) && isStr(x.itemId) && KINDS.has(x.kind as string) && x.id === `${x.kind}:${x.itemId}` &&
    isTime(x.introduced) && (x.saved === undefined || typeof x.saved === 'boolean') &&
    isNum(c.stability, 0, 1e6) && isNum(c.difficulty, 0, 10) && STATES.has(c.state as string) &&
    isInt(c.reps) && isInt(c.lapses) && isTime(c.lastReview) && isTime(c.due)
  );
}

export function checkLang(lang: LangCode, raw: unknown): LangCheck {
  const problems: string[] = [];
  const base = emptyLang(lang);
  if (raw === undefined) return { progress: base, problems, dropped: 0 };
  if (!isObj(raw)) return { progress: base, problems: [`${lang}: progress is not an object.`], dropped: 0 };
  const P = (n: string) => `${lang}.${n}`;

  const cardsIn = checkRecord<LangProgress['cards'][string]>(raw.cards, P('cards'), validCard, problems);
  const idx = index(lang);
  const cards: LangProgress['cards'] = {};
  let dropped = 0;
  for (const [k, c] of Object.entries(cardsIn)) {
    if (!validCard(c)) continue;
    const exists = c.kind === 's' ? idx.sentenceById.has(c.itemId) : idx.vocabById.has(c.itemId);
    if (!exists || k !== c.id) {
      dropped++;
      continue;
    }
    cards[k] = c;
  }

  const reviewLog = checkArray<LangProgress['reviewLog'][number]>(raw.reviewLog, P('reviewLog'), (x) => isObj(x) && isTime(x.t) && isStr(x.cardId) && isInt(x.grade, 1, 4) && typeof x.due === 'boolean', problems);
  const attempts = checkArray<LangProgress['attempts'][number]>(
    raw.attempts,
    P('attempts'),
    (x) =>
      isObj(x) && isTime(x.t) && SKILL_SET.has(x.skill as string) && typeof x.correct === 'boolean' &&
      (x.source === undefined || x.source === 'auto' || x.source === 'self') &&
      (x.quality === undefined || ['exact', 'near', 'assisted', 'retry'].includes(x.quality as string)) &&
      (x.concepts === undefined || (Array.isArray(x.concepts) && x.concepts.every((c) => isStr(c, 80)))),
    problems,
  );
  const lessons = checkRecord<LangProgress['lessons'][string]>(raw.lessons, P('lessons'), (x) => isObj(x) && (x.completedAt === undefined || isTime(x.completedAt)) && isNum(x.bestScore, 0, 1) && isInt(x.attempts), problems);
  const errors = checkRecord<LangProgress['errors'][string]>(
    raw.errors,
    P('errors'),
    (x) => isObj(x) && numList(x.recent) && numList(x.recentCorrect) && isInt(x.total) && (x.lastExample === undefined || (isObj(x.lastExample) && isStr(x.lastExample.got, 2000) && isStr(x.lastExample.want, 2000))),
    problems,
  );
  const grammarDone = checkRecord<LangProgress['grammarDone'][string]>(raw.grammarDone, P('grammarDone'), (x) => isObj(x) && isNum(x.best, 0, 1) && isTime(x.at), problems);
  const conversationsDone = checkRecord<number>(raw.conversationsDone, P('conversationsDone'), isTime, problems);
  const storiesRead = checkRecord<LangProgress['storiesRead'][string]>(raw.storiesRead, P('storiesRead'), (x) => isObj(x) && isNum(x.score, 0, 1) && isTime(x.at), problems);
  const daily = checkRecord<LangProgress['daily'][string]>(
    raw.daily,
    P('daily'),
    (x) => isObj(x) && ['xp', 'seconds', 'reviews', 'lessons', 'correct', 'answered'].every((k) => isNum(x[k], 0, 1e9)),
    problems,
  );
  const ni = raw.newIntroduced;
  const newIntroduced = ni === undefined ? base.newIntroduced : isObj(ni) && isStr(ni.date, 20) && isInt(ni.count) ? (ni as LangProgress['newIntroduced']) : (problems.push(P('newIntroduced is invalid.')), base.newIntroduced);
  // The resume snapshot is validated in full when resuming; here it only needs to be an object.
  const resume = raw.resume === undefined || raw.resume === null ? undefined : isObj(raw.resume) && isStr(raw.resume.lessonId, 50) ? (raw.resume as unknown as LangProgress['resume']) : (problems.push(P('resume is invalid.')), undefined);

  return {
    progress: { ...base, cards, reviewLog, attempts, lessons, errors, grammarDone, conversationsDone, storiesRead, daily, newIntroduced, resume },
    problems,
    dropped,
  };
}

export interface StateCheck {
  state: AppState;
  problems: string[];
  dropped: number;
  /** Language entries this version does not know about (kept untouched). */
  extraLangs: Json;
}

/** Validate a whole (already migrated) state object. */
export function checkState(raw: Json, schemaVersion: number): StateCheck {
  const problems: string[] = [];
  const langsIn = raw.langs;
  if (!isObj(langsIn)) problems.push('The data has no progress section.');
  const langs = {} as AppState['langs'];
  let dropped = 0;
  for (const l of LANG_CODES) {
    const r = checkLang(l, isObj(langsIn) ? langsIn[l] : undefined);
    problems.push(...r.problems);
    dropped += r.dropped;
    langs[l] = r.progress;
  }
  const extraLangs: Json = {};
  if (isObj(langsIn)) for (const [k, v] of Object.entries(langsIn)) if (!LANG_CODES.includes(k as LangCode)) extraLangs[k] = v;
  const badges: Record<string, number> = {};
  if (raw.badges !== undefined) {
    if (!isObj(raw.badges)) problems.push('badges is not a collection.');
    else for (const [k, v] of Object.entries(raw.badges)) if (isTime(v)) badges[k] = v as number;
  }
  const state: AppState = {
    schemaVersion,
    createdAt: isTime(raw.createdAt) ? (raw.createdAt as number) : Date.now(),
    currentLang: LANG_CODES.includes(raw.currentLang as LangCode) ? (raw.currentLang as LangCode) : 'es',
    settings: repairSettings(raw.settings),
    langs,
    badges,
    revision: isInt(raw.revision) ? (raw.revision as number) : 0,
  };
  if (Object.keys(extraLangs).length) (state as unknown as Json).extraLangs = extraLangs;
  return { state, problems, dropped, extraLangs };
}
