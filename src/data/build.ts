/**
 * Compact authoring helpers. Lessons are written as short tuples and expanded
 * here into the full content model, which keeps the course files readable
 * and reviewable by language specialists.
 */

import type { Cefr, DialogueLine, Gender, LangCode, Lesson, Pos, Sentence, Unit, VocabItem } from './types';

/**
 * Part-of-speech codes. Nouns carry their gender: nm, nf, nn (German neuter),
 * npl (plural-only).
 */
export type PosCode =
  | 'nm' | 'nf' | 'nn' | 'npl'
  | 'v' | 'adj' | 'adv' | 'pron' | 'det' | 'prep' | 'conj' | 'num' | 'int' | 'ph';

export interface VOpts {
  alt?: string[];
  enAlt?: string[];
  pl?: string;
  pron?: string;
  note?: string;
  ex?: [string, string];
  d?: number;
  gr?: string[];
  /** Override the generated id (needed when two entries share a lemma). */
  id?: string;
  /** Override the article taught with a noun (e.g. Spanish "el agua"). */
  art?: string;
}

export type V = [lemma: string, en: string, pos: PosCode, opts?: VOpts];

export interface SOpts {
  alt?: string[];
  enAlt?: string[];
  cloze?: string;
  hint?: string;
  clozeAlt?: string[];
  gr?: string[];
}

export type S = [t: string, en: string, opts?: SOpts];
export type D = [who: string, t: string, en: string];

export interface LessonDef {
  title: string;
  situation: string;
  intro: string;
  tip?: { title: string; body: string };
  dialogue: D[];
  vocab: V[];
  sentences: S[];
  grammar?: string[];
  cefr?: Cefr;
  minutes?: number;
}

export interface UnitDef {
  title: string;
  theme: string;
  cefr?: Cefr;
  lessons: LessonDef[];
}

const POS: Record<PosCode, { pos: Pos; gender?: Gender }> = {
  nm: { pos: 'noun', gender: 'm' },
  nf: { pos: 'noun', gender: 'f' },
  nn: { pos: 'noun', gender: 'n' },
  npl: { pos: 'noun', gender: 'pl' },
  v: { pos: 'verb' },
  adj: { pos: 'adj' },
  adv: { pos: 'adv' },
  pron: { pos: 'pron' },
  det: { pos: 'det' },
  prep: { pos: 'prep' },
  conj: { pos: 'conj' },
  num: { pos: 'num' },
  int: { pos: 'interj' },
  ph: { pos: 'phrase' },
};

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Default definite article for a noun. */
export function articleFor(lang: LangCode, g: Gender, lemma: string): string {
  if (lang === 'es') return g === 'f' ? 'la' : g === 'pl' ? 'los' : 'el';
  if (lang === 'de') return g === 'm' ? 'der' : g === 'n' ? 'das' : 'die';
  if (g === 'pl') return 'les';
  if (/^[aeiouyhàâäéèêëîïôöûùü]/i.test(lemma)) return "l'";
  return g === 'f' ? 'la' : 'le';
}

/** The form a learner should produce for a vocabulary item. */
export function nounForm(v: { lemma: string; art?: string; lang: LangCode }): string {
  if (!v.art) return v.lemma;
  return v.art.endsWith("'") ? `${v.art}${v.lemma}` : `${v.art} ${v.lemma}`;
}

function difficultyOf(lemma: string, pos: PosCode): number {
  const words = lemma.split(' ').length;
  if (pos === 'ph') return Math.min(5, 2 + Math.floor(words / 2));
  return lemma.length > 9 ? 3 : 2;
}

export function buildUnits(lang: LangCode, defs: UnitDef[]): Unit[] {
  return defs.map((u, ui) => {
    const unitNo = ui + 1;
    const lessons: Lesson[] = u.lessons.map((l, li) => {
      const lessonId = `${lang}-${unitNo}-${li + 1}`;
      const cefr = l.cefr ?? u.cefr ?? 'A1';
      const vocab: VocabItem[] = l.vocab.map(([lemma, en, code, o = {}]) => {
        const p = POS[code];
        return {
          id: o.id ?? `${lang}.${slug(lemma)}`,
          lang,
          lemma,
          en,
          enAlt: o.enAlt,
          alt: o.alt,
          pos: p.pos,
          gender: p.gender,
          plural: o.pl,
          art: p.pos === 'noun' ? o.art ?? articleFor(lang, p.gender!, lemma) : undefined,
          pron: o.pron,
          note: o.note,
          example: o.ex ? { t: o.ex[0], en: o.ex[1] } : undefined,
          level: cefr,
          difficulty: o.d ?? difficultyOf(lemma, code),
          grammar: o.gr ?? l.grammar,
          lessonId,
        };
      });
      const sentences: Sentence[] = l.sentences.map(([t, en, o = {}], si) => ({
        id: `${lessonId}.s${si + 1}`,
        lang,
        t,
        en,
        alt: o.alt,
        enAlt: o.enAlt,
        cloze: o.cloze,
        clozeHint: o.hint,
        clozeAlt: o.clozeAlt,
        grammar: o.gr ?? l.grammar,
        lessonId,
        level: cefr,
      }));
      const dialogue: DialogueLine[] = l.dialogue.map(([who, t, en]) => ({ who, t, en }));
      return {
        id: lessonId,
        lang,
        unit: unitNo,
        index: li + 1,
        title: l.title,
        situation: l.situation,
        cefr,
        intro: l.intro,
        tip: l.tip,
        dialogue,
        vocab,
        sentences,
        grammar: l.grammar ?? [],
        minutes: l.minutes ?? Math.max(6, Math.min(15, Math.round(vocab.length * 0.9 + sentences.length * 1.2))),
      };
    });
    return { lang, number: unitNo, title: u.title, theme: u.theme, cefr: u.cefr ?? 'A1', lessons };
  });
}
