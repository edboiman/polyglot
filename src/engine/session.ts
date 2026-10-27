/**
 * Builds exercise sequences for guided lessons and smart review.
 *
 * Lesson structure (each step documented in docs/LEARNING_SCIENCE.md):
 *   intro → dialogue in context → word cards with quick recognition →
 *   production from memory → sentence work (completion, comprehension,
 *   listening, translation) → interleaved review of earlier lessons →
 *   speaking (if available) → final check without hints → recap.
 *
 * Interleaving only draws on items the learner has already studied, so no
 * untaught material appears.
 */

import { COURSES, index, lessonOrder } from '../data/courses';
import type { LangCode, Lesson, VocabItem } from '../data/types';
import { currentRetrievability } from './fsrs';
import type { CardKind, CardRecord, LangProgress, Skill } from './model';

export type Dir = 'en2tl' | 'tl2en';

export type Exercise =
  | { t: 'intro'; lessonId: string }
  | { t: 'dialogue'; lessonId: string }
  | { t: 'present'; vocabId: string }
  | { t: 'choice'; vocabId: string; options: string[]; audio?: boolean; final?: boolean; review?: boolean }
  | { t: 'recall'; dir: Dir; vocabId: string; hints: boolean; final?: boolean; review?: boolean }
  | { t: 'listenWord'; vocabId: string; review?: boolean }
  | { t: 'cloze'; sentenceId: string; final?: boolean; review?: boolean }
  | { t: 'listen'; sentenceId: string; final?: boolean; review?: boolean; card?: { kind: CardKind; itemId: string } }
  | { t: 'translate'; dir: Dir; sentenceId: string; bank?: string[]; final?: boolean; review?: boolean }
  | { t: 'speak'; sentenceId: string }
  /**
   * Spoken production: say a word or sentence aloud. Checked by speech
   * recognition when available; otherwise the learner reveals the answer and
   * rates their own recall. prompt: 'en' shows the English meaning; 'cloze'
   * shows the sentence with a gap and asks for the whole sentence.
   */
  | { t: 'say'; from: 'vocab' | 'sentence'; id: string; prompt: 'en' | 'cloze'; card: { kind: CardKind; itemId: string }; final?: boolean; review?: boolean }
  /** Choose the English meaning of a sentence, read or heard. */
  | { t: 'meaning'; sentenceId: string; options: string[]; audio: boolean; card?: { kind: CardKind; itemId: string }; final?: boolean; review?: boolean }
  | { t: 'recap'; lessonId: string };

export type ExerciseKind = Exercise['t'];

export interface ExerciseMeta {
  graded: boolean;
  skill?: Skill;
  card?: { kind: CardKind; itemId: string };
  concepts: string[];
}

/** Which skill, memory card and grammar concepts an exercise practises. */
export function meta(lang: LangCode, ex: Exercise): ExerciseMeta {
  const raw = rawMeta(lang, ex);
  // A review exercise always keeps the identity of the card it was generated from,
  // whatever format it is shown in, so answering it reschedules that card.
  const m = 'card' in ex && ex.card ? { ...raw, card: ex.card } : raw;
  // Pronunciation notes are not something a typed answer can show errors in.
  return { ...m, concepts: m.concepts.filter((c) => !c.endsWith('.pronunciation')) };
}

function rawMeta(lang: LangCode, ex: Exercise): ExerciseMeta {
  const idx = index(lang);
  switch (ex.t) {
    case 'choice': {
      const v = idx.vocabById.get(ex.vocabId);
      return { graded: true, skill: ex.audio ? 'listening' : 'vocabRecognition', card: { kind: 'r', itemId: ex.vocabId }, concepts: v?.grammar ?? [] };
    }
    case 'recall': {
      const v = idx.vocabById.get(ex.vocabId);
      return {
        graded: true,
        skill: ex.dir === 'en2tl' ? 'vocabProduction' : 'vocabRecognition',
        card: { kind: ex.dir === 'en2tl' ? 'p' : 'r', itemId: ex.vocabId },
        concepts: v?.pos === 'noun' && ex.dir === 'en2tl' ? [`${lang}.${lang === 'fr' ? 'articles' : 'gender'}`] : [],
      };
    }
    case 'listenWord':
      return { graded: true, skill: 'listening', card: { kind: 'r', itemId: ex.vocabId }, concepts: [] };
    case 'cloze': {
      const s = idx.sentenceById.get(ex.sentenceId);
      return { graded: true, skill: 'grammar', card: { kind: 's', itemId: ex.sentenceId }, concepts: s?.grammar ?? [] };
    }
    case 'listen': {
      const s = idx.sentenceById.get(ex.sentenceId);
      return { graded: true, skill: 'listening', concepts: ex.card ? s?.grammar ?? [] : [] };
    }
    case 'translate': {
      const s = idx.sentenceById.get(ex.sentenceId);
      return ex.dir === 'en2tl'
        ? { graded: true, skill: 'writing', card: { kind: 's', itemId: ex.sentenceId }, concepts: s?.grammar ?? [] }
        : { graded: true, skill: 'reading', concepts: [] };
    }
    case 'speak':
      return { graded: true, skill: 'speaking', concepts: [] };
    case 'say': {
      if (ex.from === 'vocab') {
        const v = idx.vocabById.get(ex.id);
        return { graded: true, skill: 'vocabProduction', card: ex.card, concepts: v?.pos === 'noun' ? [`${lang}.${lang === 'fr' ? 'articles' : 'gender'}`] : [] };
      }
      const s = idx.sentenceById.get(ex.id);
      return { graded: true, skill: 'speaking', card: ex.card, concepts: s?.grammar ?? [] };
    }
    case 'meaning':
      return { graded: true, skill: ex.audio ? 'listening' : 'reading', card: ex.card, concepts: [] };
    default:
      return { graded: false, concepts: [] };
  }
}

/* ----------------------------------------------------------- utilities */

export type Rng = () => number;

/** Small deterministic PRNG so sessions are reproducible in tests. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every English meaning accepted for a vocabulary item (lower-cased). */
export function acceptedMeanings(v: VocabItem): Set<string> {
  return new Set([v.en, ...(v.enAlt ?? [])].map((m) => m.toLowerCase().trim()));
}

/**
 * Answer choices: the right one plus distractors of the same part of speech
 * from material already taught. A distractor is never a meaning the app
 * accepts for the target word, and never shares a meaning with it, so
 * exactly one displayed choice is correct.
 */
export function choiceOptions(lang: LangCode, v: VocabItem, rng: Rng, n = 4): string[] {
  const idx = index(lang);
  const order = lessonOrder(lang, v.lessonId);
  const accepted = acceptedMeanings(v);
  const pool = [...idx.vocabById.values()].filter((o) => {
    if (o.id === v.id || lessonOrder(lang, o.lessonId) > order) return false;
    for (const m of acceptedMeanings(o)) if (accepted.has(m)) return false;
    return true;
  });
  const same = pool.filter((o) => o.pos === v.pos);
  const near = same.filter((o) => o.lessonId === v.lessonId);
  const picks: string[] = [];
  for (const o of [...shuffle(near, rng), ...shuffle(same, rng), ...shuffle(pool, rng)]) {
    if (picks.length >= n - 1) break;
    if (!picks.includes(o.en) && !accepted.has(o.en.toLowerCase())) picks.push(o.en);
  }
  return shuffle([v.en, ...picks], rng);
}

/** Word bank for sentence building: the sentence's words plus a few distractors. */
export function wordBank(lang: LangCode, text: string, rng: Rng, lessonId?: string): string[] {
  const words = text.replace(/[¿¡]/g, '').replace(/[.,!?;:]/g, '').split(/\s+/).filter(Boolean);
  const idx = index(lang);
  const limit = lessonId ? lessonOrder(lang, lessonId) : Infinity;
  const extra = shuffle(
    [...idx.vocabById.values()].filter(
      (v) => !v.lemma.includes(' ') && lessonOrder(lang, v.lessonId) <= limit && !words.map((w) => w.toLowerCase()).includes(v.lemma.toLowerCase()),
    ),
    rng,
  )
    .slice(0, 2)
    .map((v) => v.lemma);
  return shuffle([...words, ...extra], rng);
}

/** Has the learner studied this vocabulary item at all? */
function known(p: LangProgress, vocabId: string): boolean {
  return !!(p.cards[`p:${vocabId}`] || p.cards[`r:${vocabId}`]);
}

export interface LessonBuildOptions {
  audio: boolean;
  mic: boolean;
  rng: Rng;
  now: number;
  /** Include typed answers. When false, every typed exercise becomes spoken or multiple choice. */
  typing?: boolean;
}

/* ------------------------------------------------------- spoken mode */

const acceptedEn = (s: { en: string; enAlt?: string[] }) => new Set([s.en, ...(s.enAlt ?? [])].map((x) => x.toLowerCase().trim()));

/**
 * English-meaning options for a sentence: the right one plus sentences from
 * material already taught, never one whose meaning the app also accepts.
 */
export function sentenceOptions(lang: LangCode, sentenceId: string, rng: Rng, n = 4): string[] {
  const idx = index(lang);
  const s = idx.sentenceById.get(sentenceId)!;
  const ok = acceptedEn(s);
  const order = lessonOrder(lang, s.lessonId);
  const clash = (o: { en: string; enAlt?: string[] }) => [...acceptedEn(o)].some((m) => ok.has(m));
  const all = [...idx.sentenceById.values()].filter((o) => o.id !== s.id && !clash(o));
  const taught = all.filter((o) => lessonOrder(lang, o.lessonId) <= order);
  const near = taught.filter((o) => o.lessonId === s.lessonId);
  const picks: string[] = [];
  for (const o of [...shuffle(near, rng), ...shuffle(taught, rng), ...shuffle(all, rng)]) {
    if (picks.length >= n - 1) break;
    if (!picks.includes(o.en)) picks.push(o.en);
  }
  return shuffle([s.en, ...picks], rng);
}

const TYPED = new Set(['recall', 'listenWord', 'cloze', 'listen', 'translate']);

/** Does this exercise ask the learner to type? */
export function isTyped(ex: Exercise): boolean {
  return TYPED.has(ex.t);
}

/**
 * Convert a typed exercise into its spoken or multiple-choice equivalent,
 * keeping the memory card it practises (so scheduling is unchanged).
 */
export function verbalize(lang: LangCode, ex: Exercise, rng: Rng, audio: boolean): Exercise {
  const idx = index(lang);
  const flags = (e: { final?: boolean; review?: boolean }) => ({ ...(e.final ? { final: true } : {}), ...(e.review ? { review: true } : {}) });
  switch (ex.t) {
    case 'recall':
      if (ex.dir === 'en2tl') return { t: 'say', from: 'vocab', id: ex.vocabId, prompt: 'en', card: { kind: 'p', itemId: ex.vocabId }, ...flags(ex) };
      return { t: 'choice', vocabId: ex.vocabId, options: choiceOptions(lang, idx.vocabById.get(ex.vocabId)!, rng), ...flags(ex) };
    case 'listenWord':
      return { t: 'choice', vocabId: ex.vocabId, options: choiceOptions(lang, idx.vocabById.get(ex.vocabId)!, rng), audio, ...flags(ex) };
    case 'cloze':
      return { t: 'say', from: 'sentence', id: ex.sentenceId, prompt: 'cloze', card: { kind: 's', itemId: ex.sentenceId }, ...flags(ex) };
    case 'listen':
      return { t: 'meaning', sentenceId: ex.sentenceId, options: sentenceOptions(lang, ex.sentenceId, rng), audio, ...(ex.card ? { card: ex.card } : {}), ...flags(ex) };
    case 'translate':
      if (ex.dir === 'en2tl') return { t: 'say', from: 'sentence', id: ex.sentenceId, prompt: 'en', card: { kind: 's', itemId: ex.sentenceId }, ...flags(ex) };
      return { t: 'meaning', sentenceId: ex.sentenceId, options: sentenceOptions(lang, ex.sentenceId, rng), audio: false, ...flags(ex) };
    default:
      return ex;
  }
}

/* -------------------------------------------------------------- lesson */

export function buildLesson(lesson: Lesson, p: LangProgress, o: LessonBuildOptions): Exercise[] {
  const lang = lesson.lang;
  const rng = o.rng;
  const out: Exercise[] = [{ t: 'intro', lessonId: lesson.id }, { t: 'dialogue', lessonId: lesson.id }];
  const unit = lesson.unit;
  const repeat = !!p.lessons[lesson.id]?.completedAt;

  // 1. New words in chunks of three: present → recognise → produce.
  const vocab = lesson.vocab;
  for (let i = 0; i < vocab.length; i += 3) {
    const chunk = vocab.slice(i, i + 3);
    for (const v of chunk) if (!repeat || !known(p, v.id)) out.push({ t: 'present', vocabId: v.id });
    for (const v of shuffle(chunk, rng)) out.push({ t: 'choice', vocabId: v.id, options: choiceOptions(lang, v, rng), audio: o.audio && rng() < 0.25 });
    for (const v of shuffle(chunk, rng)) out.push({ t: 'recall', dir: 'en2tl', vocabId: v.id, hints: true });
  }

  // 2. Interleaved review of earlier material (weakest first).
  const earlier = interleaveCandidates(lang, lesson, p, o.now).slice(0, 3);
  const review: Exercise[] = earlier.map((c) =>
    c.kind === 's'
      ? ({ t: 'cloze', sentenceId: c.itemId, review: true } as Exercise)
      : ({ t: 'recall', dir: c.kind === 'p' ? 'en2tl' : 'tl2en', vocabId: c.itemId, hints: false, review: true } as Exercise),
  );

  // 3. Sentences: completion, comprehension, listening and translation.
  const sentences = lesson.sentences;
  const sentEx: Exercise[] = [];
  sentences.forEach((s, i) => {
    if (s.cloze) sentEx.push({ t: 'cloze', sentenceId: s.id });
    if (i % 2 === 0) sentEx.push({ t: 'translate', dir: 'tl2en', sentenceId: s.id });
    else if (o.audio) sentEx.push({ t: 'listen', sentenceId: s.id });
    else sentEx.push({ t: 'translate', dir: 'tl2en', sentenceId: s.id });
  });
  // Two sentences produced in the target language: word bank early in the course, typed later.
  const toProduce = shuffle(sentences, rng).slice(0, 2);
  for (const s of toProduce) {
    sentEx.push({ t: 'translate', dir: 'en2tl', sentenceId: s.id, bank: unit <= 2 ? wordBank(lang, s.t, rng, lesson.id) : undefined });
  }
  const mid = Math.ceil(sentEx.length / 2);
  out.push(...sentEx.slice(0, mid), ...review, ...sentEx.slice(mid));

  // 4. Speaking (optional; skipped automatically when no microphone).
  if (o.mic) {
    const line = shortest(sentences.map((s) => s.id), lang);
    if (line) out.push({ t: 'speak', sentenceId: line });
  }

  // 5. Final check: no hints, no word bank.
  const finalVocab = shuffle(vocab, rng).slice(0, 2);
  for (const v of finalVocab) out.push({ t: 'recall', dir: 'en2tl', vocabId: v.id, hints: false, final: true });
  const finalSent = shuffle(sentences, rng);
  if (finalSent[0]) out.push({ t: 'translate', dir: 'en2tl', sentenceId: finalSent[0].id, final: true });
  const cl = finalSent.find((s) => s.cloze && s.id !== finalSent[0]?.id);
  if (cl) out.push({ t: 'cloze', sentenceId: cl.id, final: true });
  else if (o.audio && finalSent[1]) out.push({ t: 'listen', sentenceId: finalSent[1].id, final: true });

  out.push({ t: 'recap', lessonId: lesson.id });
  return o.typing === false ? out.map((e) => verbalize(lang, e, rng, o.audio)) : out;
}

function shortest(ids: string[], lang: LangCode): string | undefined {
  const idx = index(lang);
  return [...ids].sort((a, b) => idx.sentenceById.get(a)!.t.length - idx.sentenceById.get(b)!.t.length)[0];
}

/** Previously studied cards from earlier lessons, lowest recall probability first. */
export function interleaveCandidates(lang: LangCode, lesson: Lesson, p: LangProgress, now: number): CardRecord[] {
  const idx = index(lang);
  const pos = lessonOrder(lang, lesson.id);
  return Object.values(p.cards)
    .filter((c) => {
      if (c.card.state === 'new') return false;
      const lid = c.kind === 's' ? idx.sentenceById.get(c.itemId)?.lessonId : idx.vocabById.get(c.itemId)?.lessonId;
      return !!lid && lessonOrder(lang, lid) < pos;
    })
    .sort((a, b) => currentRetrievability(a.card, now) - currentRetrievability(b.card, now));
}

/* -------------------------------------------------------------- review */

export type ReviewMode = 'due' | 'difficult' | 'missed' | 'grammar' | 'saved';

export interface ReviewOptions {
  mode: ReviewMode;
  limit: number;
  audio: boolean;
  /** Include typed answers (default true). */
  typing?: boolean;
  rng: Rng;
  now: number;
  concept?: string;
}

/** Turn a memory card into a retrieval exercise, varying the format by repetition. */
export function exerciseForCard(lang: LangCode, c: CardRecord, audio: boolean, typing = true): Exercise | null {
  const ex = typedExerciseForCard(lang, c, audio);
  if (!ex || typing) return ex;
  return verbalize(lang, ex, seededRng(c.card.reps * 7919 + c.itemId.length), audio);
}

function typedExerciseForCard(lang: LangCode, c: CardRecord, audio: boolean): Exercise | null {
  const idx = index(lang);
  if (c.kind === 's') {
    const s = idx.sentenceById.get(c.itemId);
    if (!s) return null;
    const v = c.card.reps % 3;
    if (v === 0 && s.cloze) return { t: 'cloze', sentenceId: s.id, review: true };
    if (v === 1 && audio) return { t: 'listen', sentenceId: s.id, review: true, card: { kind: 's', itemId: s.id } };
    return { t: 'translate', dir: 'en2tl', sentenceId: s.id, review: true };
  }
  const v = idx.vocabById.get(c.itemId);
  if (!v) return null;
  if (c.kind === 'p') {
    const hints = c.card.stability < 2 && c.card.reps < 4; // fade hints once memory is stable
    return { t: 'recall', dir: 'en2tl', vocabId: v.id, hints, review: true };
  }
  if (audio && c.card.reps % 3 === 2) return { t: 'listenWord', vocabId: v.id, review: true };
  return { t: 'recall', dir: 'tl2en', vocabId: v.id, hints: false, review: true };
}

/** Avoid two exercises on the same item back to back. */
export function spreadOut(items: Exercise[], lang: LangCode): Exercise[] {
  const key = (e: Exercise) => meta(lang, e).card?.itemId ?? JSON.stringify(e);
  const out: Exercise[] = [];
  const rest = [...items];
  while (rest.length) {
    const i = rest.findIndex((e) => !out.length || key(e) !== key(out[out.length - 1]));
    out.push(...rest.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}

export function selectReviewCards(lang: LangCode, p: LangProgress, o: Omit<ReviewOptions, 'audio' | 'rng'>): CardRecord[] {
  const all = Object.values(p.cards).filter((c) => c.card.state !== 'new' || c.saved);
  const idx = index(lang);
  let picked: CardRecord[];
  switch (o.mode) {
    case 'due':
      picked = all.filter((c) => c.card.due <= o.now).sort((a, b) => a.card.due - b.card.due);
      break;
    case 'difficult':
      picked = all
        .filter((c) => c.card.lapses > 0 || c.card.difficulty >= 7)
        .sort((a, b) => b.card.lapses - a.card.lapses || b.card.difficulty - a.card.difficulty);
      break;
    case 'missed': {
      const since = o.now - 7 * 86_400_000;
      const missed = new Set(p.reviewLog.filter((r) => r.t >= since && r.grade === 1).map((r) => r.cardId));
      picked = all.filter((c) => missed.has(c.id));
      break;
    }
    case 'grammar':
      picked = all
        .filter((c) => c.kind === 's' && (!o.concept || idx.sentenceById.get(c.itemId)?.grammar?.includes(o.concept)))
        .sort((a, b) => currentRetrievability(a.card, o.now) - currentRetrievability(b.card, o.now));
      break;
    case 'saved':
      picked = all.filter((c) => c.saved);
      break;
  }
  return picked.slice(0, o.limit);
}

export function buildReview(lang: LangCode, p: LangProgress, o: ReviewOptions): Exercise[] {
  const cards = selectReviewCards(lang, p, o);
  const ex = shuffle(cards, o.rng)
    .map((c) => exerciseForCard(lang, c, o.audio, o.typing !== false))
    .filter((e): e is Exercise => !!e);
  return spreadOut(ex, lang);
}

/** Expected answers for a graded exercise (first = canonical). */
export function expectedAnswers(lang: LangCode, ex: Exercise): string[] {
  const idx = index(lang);
  switch (ex.t) {
    case 'recall': {
      const v = idx.vocabById.get(ex.vocabId)!;
      if (ex.dir === 'tl2en') return [v.en, ...(v.enAlt ?? [])];
      const form = v.art ? (v.art.endsWith("'") ? `${v.art}${v.lemma}` : `${v.art} ${v.lemma}`) : v.lemma;
      const alts = (v.alt ?? []).map((a) => (v.art ? (v.art.endsWith("'") ? `${v.art}${a}` : `${v.art} ${a}`) : a));
      return [form, ...alts];
    }
    case 'listenWord': {
      const v = idx.vocabById.get(ex.vocabId)!;
      return [v.lemma, ...(v.alt ?? [])];
    }
    case 'cloze': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      return [s.cloze!, ...(s.clozeAlt ?? [])];
    }
    case 'listen': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      return [s.t, ...(s.alt ?? [])];
    }
    case 'translate': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      return ex.dir === 'en2tl' ? [s.t, ...(s.alt ?? [])] : [s.en, ...(s.enAlt ?? [])];
    }
    case 'speak': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      return [s.t, ...(s.alt ?? [])];
    }
    case 'choice': {
      const v = idx.vocabById.get(ex.vocabId)!;
      return [v.en, ...(v.enAlt ?? [])];
    }
    case 'say': {
      if (ex.from === 'sentence') {
        const s = idx.sentenceById.get(ex.id)!;
        return [s.t, ...(s.alt ?? [])];
      }
      const v = idx.vocabById.get(ex.id)!;
      const withArt = (x: string) => (v.art ? (v.art.endsWith("'") ? `${v.art}${x}` : `${v.art} ${x}`) : x);
      return [withArt(v.lemma), ...(v.alt ?? []).map(withArt)];
    }
    case 'meaning': {
      const s = idx.sentenceById.get(ex.sentenceId)!;
      return [s.en, ...(s.enAlt ?? [])];
    }
    default:
      return [];
  }
}

/** Is a lesson available to start? Linear by default. */
export function lessonUnlocked(lang: LangCode, lessonId: string, p: LangProgress, free: boolean): boolean {
  if (free) return true;
  const list = index(lang).lessons;
  const i = list.findIndex((l) => l.id === lessonId);
  if (i <= 0) return true;
  return !!p.lessons[list[i - 1].id]?.completedAt;
}

export function nextLesson(lang: LangCode, p: LangProgress): Lesson | undefined {
  return index(lang).lessons.find((l) => !p.lessons[l.id]?.completedAt);
}

export function contentUnlocked(_lang: LangCode, unlockAfter: string, p: LangProgress, free: boolean): boolean {
  return free || !!p.lessons[unlockAfter]?.completedAt;
}

export function courseOf(lang: LangCode) {
  return COURSES[lang];
}

/** Is this a well-formed exercise whose content exists in the course? (Used to validate saved sessions.) */
export function isValidExercise(lang: LangCode, e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  const idx = index(lang);
  const has = (m: Map<string, unknown>, k: unknown) => typeof k === 'string' && m.has(k);
  switch (x.t) {
    case 'intro':
    case 'dialogue':
    case 'recap':
      return has(idx.lessonById, x.lessonId);
    case 'present':
    case 'listenWord':
      return has(idx.vocabById, x.vocabId);
    case 'choice':
      return has(idx.vocabById, x.vocabId) && Array.isArray(x.options) && x.options.every((o) => typeof o === 'string');
    case 'recall':
      return has(idx.vocabById, x.vocabId) && (x.dir === 'en2tl' || x.dir === 'tl2en');
    case 'cloze':
      return has(idx.sentenceById, x.sentenceId) && !!idx.sentenceById.get(x.sentenceId as string)?.cloze;
    case 'listen':
    case 'speak':
      return has(idx.sentenceById, x.sentenceId);
    case 'translate':
      return has(idx.sentenceById, x.sentenceId) && (x.dir === 'en2tl' || x.dir === 'tl2en') && (x.bank === undefined || Array.isArray(x.bank));
    case 'say': {
      const c = x.card as Record<string, unknown> | undefined;
      const okId = x.from === 'vocab' ? has(idx.vocabById, x.id) : x.from === 'sentence' && has(idx.sentenceById, x.id);
      return okId && (x.prompt === 'en' || x.prompt === 'cloze') && !!c && typeof c.itemId === 'string' && ['p', 'r', 's'].includes(c.kind as string);
    }
    case 'meaning':
      return has(idx.sentenceById, x.sentenceId) && Array.isArray(x.options) && x.options.every((o) => typeof o === 'string');
    default:
      return false;
  }
}
