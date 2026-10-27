/**
 * Answer validation.
 *
 * Grading is deliberately not exact-string comparison. The checker:
 *   1. normalises case, punctuation, apostrophes, spacing and Unicode form;
 *   2. accepts every listed alternative (and English contractions);
 *   3. in German, treats ae/oe/ue/ss typed for ä/ö/ü/ß as correct;
 *   4. accepts a missing accent with a note ("almost");
 *   5. tolerates small typos in long content words — but never in articles,
 *      pronouns or other short grammatical words, where one letter changes
 *      the meaning (el/la, den/dem, est/es);
 *   6. aligns the answer word-by-word with the closest accepted answer and
 *      classifies each difference (article, ending, missing word, order…)
 *      so feedback can name the specific mistake.
 */

import type { Gender, LangCode } from '../data/types';

export type Lang = LangCode | 'en';

export type IssueKind =
  | 'accent'
  | 'umlaut'
  | 'typo'
  | 'article'
  | 'ending'
  | 'wrongWord'
  | 'missingWord'
  | 'extraWord'
  | 'wordOrder'
  | 'letter'
  | 'otherWord'
  | 'empty';

export interface Issue {
  kind: IssueKind;
  /** What the learner wrote (token), if applicable. */
  got?: string;
  /** What was expected (token), if applicable. */
  want?: string;
}

export type Verdict = 'correct' | 'almost' | 'wrong';

export interface CheckResult {
  verdict: Verdict;
  /** The accepted answer closest to what the learner wrote (display form). */
  expected: string;
  issues: Issue[];
  /** Plain-language feedback lines. */
  feedback: string[];
}

export interface CheckOptions {
  lang: Lang;
  /** For single-word English answers: ignore leading articles and "to". */
  loose?: boolean;
  /** Articles in the target language with their gender, for feedback. */
  articles?: Record<string, Gender | 'indef' | 'other'>;
  /** Accept missing accents as correct-with-note (default true). */
  accentTolerant?: boolean;
  /**
   * Noun production: a missing leading article is accepted as "almost"
   * (graded Hard) with a reminder, rather than marked wrong.
   */
  articleOptional?: boolean;
  /**
   * Real words of the target language. A typo or missing accent that turns
   * the answer into a *different* real word (poisson → poison) is wrong,
   * not a slip.
   */
  knownWords?: Set<string>;
}

const PUNCT = /[.,!?¿¡;:"“”„«»()…—–]/g;

export function normalize(input: string, lang: Lang): string {
  let s = input.normalize('NFC').toLowerCase();
  s = s.replace(/[’‘`´]/g, "'");
  s = s.replace(PUNCT, ' ');
  s = s.replace(/-/g, ' ');
  if (lang === 'fr') s = s.replace(/'\s+/g, "'"); // "j' ai" → "j'ai"
  if (lang === 'en') s = expandEnglish(s);
  return s.replace(/\s+/g, ' ').trim();
}

const EN_CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'],
  [/\byou're\b/g, 'you are'],
  [/\bwe're\b/g, 'we are'],
  [/\bthey're\b/g, 'they are'],
  [/\bhe's\b/g, 'he is'],
  [/\bshe's\b/g, 'she is'],
  [/\bit's\b/g, 'it is'],
  [/\bthat's\b/g, 'that is'],
  [/\bthere's\b/g, 'there is'],
  [/\bwhat's\b/g, 'what is'],
  [/\bwhere's\b/g, 'where is'],
  [/\bhow's\b/g, 'how is'],
  [/\bwho's\b/g, 'who is'],
  [/\bi've\b/g, 'i have'],
  [/\bwe've\b/g, 'we have'],
  [/\bthey've\b/g, 'they have'],
  [/\byou've\b/g, 'you have'],
  [/\bi'll\b/g, 'i will'],
  [/\bi'd\b/g, 'i would'],
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bdidn't\b/g, 'did not'],
  [/\bisn't\b/g, 'is not'],
  [/\baren't\b/g, 'are not'],
  [/\bwasn't\b/g, 'was not'],
  [/\bhaven't\b/g, 'have not'],
  [/\blet's\b/g, 'let us'],
  [/\bwhats\b/g, 'what is'],
  [/\bim\b/g, 'i am'],
  [/\bdont\b/g, 'do not'],
  [/\bok\b/g, 'okay'],
  [/\bmr\b/g, 'mister'],
  [/\bmrs\b/g, 'missus'],
];

function expandEnglish(s: string): string {
  for (const [re, rep] of EN_CONTRACTIONS) s = s.replace(re, rep);
  return s;
}

export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Language-aware folding used for tolerance checks. Only marks that are
 * plausibly a typing convenience are removed:
 *  - Spanish: acute accents and ü, but ñ is kept (año ≠ ano).
 *  - German: nothing is stripped; ä/ö/ü/ß are equated only with ae/oe/ue/ss.
 *  - French / English: all accents.
 */
export function foldFor(lang: Lang, s: string): string {
  if (lang === 'de') return transliterateGerman(s);
  if (lang === 'es') return foldAccents(s.replace(/ñ/g, '\uE000')).replace(/\uE000/g, 'ñ');
  return foldAccents(s);
}

/** German typing convention: ä→ae, ö→oe, ü→ue, ß→ss. */
export function transliterateGerman(s: string): string {
  return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Optimal string alignment distance: insert, delete, substitute, and
  // swap two adjacent letters ("teh" → "the" counts as one slip).
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Short grammatical words in which a one-letter change is a real error. */
const PROTECTED: Record<Lang, Set<string>> = {
  es: new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'es', 'está', 'esta', 'son', 'soy', 'estoy', 'eres', 'estás', 'yo', 'tú', 'tu', 'él', 'el', 'mi', 'mis', 'su', 'sus', 'se', 'te', 'me', 'lo', 'le', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'no', 'si', 'sí', 'que', 'qué', 'este', 'esta', 'esto', 'ese', 'esa', 'hay', 'ha', 'he', 'va', 'voy', 'van']),
  de: new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine', 'keinen', 'keinem', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mein', 'meine', 'meinen', 'meinem', 'dein', 'deine', 'sein', 'seine', 'ist', 'bin', 'bist', 'sind', 'seid', 'hat', 'hast', 'habe', 'haben', 'in', 'im', 'an', 'am', 'zu', 'zum', 'zur', 'mit', 'auf', 'aus', 'bei', 'von', 'vom', 'und', 'oder', 'nicht', 'mir', 'dir', 'mich', 'dich', 'ihm', 'ihn', 'uns', 'euch']),
  fr: new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', "l'", 'au', 'aux', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'est', 'es', 'et', 'suis', 'sont', 'ai', 'as', 'a', 'à', 'ont', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ce', 'cet', 'cette', 'ces', 'ne', 'pas', 'en', 'y', 'qui', 'que', 'se', 'me', 'te', 'ou', 'où', 'sur', 'sous']),
  en: new Set(['a', 'an', 'the', 'is', 'are', 'am', 'was', 'he', 'she', 'it', 'we', 'they', 'his', 'her', 'my', 'your', 'not', 'no', 'in', 'on', 'at', 'to', 'of', 'this', 'that', 'these', 'those', 'i', 'you', 'me', 'him', 'us', 'them', 'and', 'or']),
};

function tokens(s: string): string[] {
  return s.split(' ').filter(Boolean);
}

function maxTypos(len: number): number {
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  return 2;
}

type Op = { type: 'same' | 'sub' | 'del' | 'ins'; got?: string; want?: string };

/** Word-level alignment (edit distance over tokens) with backtrace. */
function alignTokens(got: string[], want: string[], eq: (a: string, b: string) => boolean): Op[] {
  const n = got.length;
  const m = want.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (eq(got[i - 1], want[j - 1]) ? 0 : 1));
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (eq(got[i - 1], want[j - 1]) ? 0 : 1)) {
      ops.push({ type: eq(got[i - 1], want[j - 1]) ? 'same' : 'sub', got: got[i - 1], want: want[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'ins', got: got[i - 1] });
      i--;
    } else {
      ops.push({ type: 'del', want: want[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort().join(' ');
  const y = [...b].sort().join(' ');
  return x === y;
}

const ES_PRONOUNS = ['yo', 'tú', 'él', 'ella', 'usted', 'nosotros', 'nosotras', 'vosotros', 'vosotras', 'ellos', 'ellas', 'ustedes'];
const EN_LOOSE_PREFIX = /^(the|a|an|to) /;

/** Expand the list of accepted answers with safe automatic variants. */
function variants(answer: string, opts: CheckOptions): string[] {
  const n = normalize(answer, opts.lang);
  const out = new Set([n]);
  if (opts.lang === 'es') {
    const first = n.split(' ')[0];
    if (ES_PRONOUNS.includes(first) && n.split(' ').length > 1) out.add(n.slice(first.length + 1)); // pro-drop
  }
  if (opts.lang === 'en' && opts.loose) {
    out.add(n.replace(EN_LOOSE_PREFIX, ''));
  }
  return [...out];
}

function tokenEqual(lang: Lang) {
  return (a: string, b: string) => {
    if (a === b) return true;
    if (lang === 'de') return transliterateGerman(a) === transliterateGerman(b);
    return false;
  };
}

interface Candidate {
  display: string;
  norm: string;
}

/**
 * Check `input` against the accepted answers. The first answer is the
 * canonical one; later answers are alternatives.
 */
export function checkAnswer(input: string, answers: string[], opts: CheckOptions): CheckResult {
  const accentTolerant = opts.accentTolerant !== false;
  const lang = opts.lang;
  const canonical = answers[0] ?? '';
  let got = normalize(input, lang);
  if (lang === 'en' && opts.loose) got = got.replace(EN_LOOSE_PREFIX, '');

  if (!got) {
    return { verdict: 'wrong', expected: canonical, issues: [{ kind: 'empty' }], feedback: ['No answer given.'] };
  }

  const cands: Candidate[] = [];
  for (const a of answers) for (const v of variants(a, opts)) cands.push({ display: a, norm: v });

  // 1. Exact (normalised) match.
  for (const c of cands) if (c.norm === got) return { verdict: 'correct', expected: c.display, issues: [], feedback: [] };

  // 2. German ae/oe/ue/ss spelling.
  if (lang === 'de') {
    const tg = transliterateGerman(got);
    for (const c of cands)
      if (transliterateGerman(c.norm) === tg)
        return {
          verdict: 'correct',
          expected: c.display,
          issues: [{ kind: 'umlaut' }],
          feedback: ['Correct. (ae/oe/ue/ss is an accepted way to type ä/ö/ü/ß.)'],
        };
  }

  // 3. Noun given without its article ("madre" for "la madre", "eau" for "l'eau").
  if (opts.articleOptional && opts.articles) {
    for (const c of cands) {
      const m = c.norm.match(/^(\S+?'|\S+ )(.+)$/);
      if (!m) continue;
      const art = m[1].trim();
      if (!(art in opts.articles)) continue;
      const rest = m[2];
      if (rest === got || foldFor(lang, rest) === foldFor(lang, got)) {
        const issues: Issue[] = [{ kind: 'article', got: '', want: art }];
        return { verdict: 'almost', expected: c.display, issues, feedback: describe(issues, 'almost', c.display, opts) };
      }
    }
  }

  // 4. Word-level comparison against the closest candidate.
  const gotTok = tokens(got);
  const eq = tokenEqual(lang);
  let best: { c: Candidate; ops: Op[]; cost: number } | null = null;
  for (const c of cands) {
    const ops = alignTokens(gotTok, tokens(c.norm), eq);
    const cost = ops.reduce((s, o) => {
      if (o.type === 'same') return s;
      if (o.type === 'sub') {
        const d = levenshtein(foldFor(lang, o.got!), foldFor(lang, o.want!));
        return s + Math.min(1, d / Math.max(3, o.want!.length));
      }
      return s + 1;
    }, 0);
    if (!best || cost < best.cost) best = { c, ops, cost };
  }
  const { c, ops } = best!;
  const wantTok = tokens(c.norm);

  // Same words, different order.
  if (gotTok.length > 1 && sameMultiset(gotTok, wantTok)) {
    return {
      verdict: 'wrong',
      expected: c.display,
      issues: [{ kind: 'wordOrder' }],
      feedback: ['You used the right words, but the word order is different.', `Correct order: ${c.display}`],
    };
  }

  const issues: Issue[] = [];
  const prot = PROTECTED[lang];
  for (const o of ops) {
    if (o.type === 'same') continue;
    if (o.type === 'ins') {
      issues.push({ kind: 'extraWord', got: o.got });
      continue;
    }
    if (o.type === 'del') {
      const isLeadingArticle = o === ops[0] && !!opts.articles && o.want! in opts.articles;
      if (isLeadingArticle && opts.articleOptional) issues.push({ kind: 'article', got: '', want: o.want });
      else issues.push({ kind: 'missingWord', want: o.want });
      continue;
    }
    const g = o.got!;
    const w = o.want!;
    const fg = foldFor(lang, g);
    const fw = foldFor(lang, w);
    const looseSame = foldAccents(g) === foldAccents(w);
    if (looseSame && fg !== fw) {
      // Umlaut or ñ dropped: a different letter, often a different word (schon/schön, ano/año).
      issues.push({ kind: 'letter', got: g, want: w });
    } else if (fg !== fw && opts.knownWords?.has(g) && levenshtein(fg, fw) <= maxTypos(w.length) + 1) {
      issues.push({ kind: 'otherWord', got: g, want: w });
    } else if (fg === fw && !prot.has(w) && opts.knownWords?.has(g)) {
      // Accent-only difference that produces another real word: accepted only as a near miss with a clear note.
      issues.push({ kind: 'accent', got: g, want: w });
    } else if (fg === fw && !prot.has(w)) {
      issues.push({ kind: 'accent', got: g, want: w });
    } else if (fg === fw && prot.has(w)) {
      // Accent changes meaning in short words (el/él, tu/tú, a/à, ou/où).
      issues.push({ kind: accentTolerant ? 'accent' : 'wrongWord', got: g, want: w });
    } else if (opts.articles && g in opts.articles && w in opts.articles) {
      issues.push({ kind: 'article', got: g, want: w });
    } else if (!prot.has(w) && !prot.has(g) && levenshtein(fg, fw) <= maxTypos(w.length) && !looksLikeEnding(fg, fw)) {
      issues.push({ kind: 'typo', got: g, want: w });
    } else if (looksLikeEnding(fg, fw)) {
      issues.push({ kind: 'ending', got: g, want: w });
    } else {
      issues.push({ kind: 'wrongWord', got: g, want: w });
    }
  }

  const blocking = issues.filter(
    (i) =>
      !(
        i.kind === 'typo' ||
        (i.kind === 'accent' && accentTolerant) ||
        (i.kind === 'article' && i.got === '' && opts.articleOptional)
      ),
  );
  const verdict: Verdict = blocking.length === 0 ? 'almost' : 'wrong';
  return { verdict, expected: c.display, issues, feedback: describe(issues, verdict, c.display, opts) };
}

/**
 * Same stem, different ending: typical of verb conjugation or agreement
 * errors (habla/hablo, grand/grande, macht/machst). Only flagged when the
 * words share a stem of at least 3 letters and differ only at the end.
 */
function looksLikeEnding(a: string, b: string): boolean {
  if (a === b || a.length < 3 || b.length < 3) return false;
  // A doubled or dropped double letter ("manzanna") is a typo, not an ending.
  const squash = (s: string) => s.replace(/(.)\1+/g, '$1');
  if (squash(a) === squash(b)) return false;
  // Swapped letters ("aeropuerot") are a typo, not a different ending.
  if (a.length === b.length && [...a].sort().join('') === [...b].sort().join('')) return false;
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  const stem = Math.min(a.length, b.length) >= 4 ? 3 : 2;
  return k >= stem && a.length - k <= 3 && b.length - k <= 3;
}

const GENDER_NAME: Record<string, string> = { m: 'masculine', f: 'feminine', n: 'neuter', pl: 'plural' };

function describe(issues: Issue[], verdict: Verdict, expected: string, opts: CheckOptions): string[] {
  const out: string[] = [];
  if (verdict === 'almost') out.push('Accepted.');
  for (const i of issues) {
    switch (i.kind) {
      case 'accent':
        out.push(`Watch the accent: “${i.want}”, not “${i.got}”.`);
        break;
      case 'typo':
        out.push(`Small spelling slip: “${i.want}” (you wrote “${i.got}”).`);
        break;
      case 'article': {
        if (!i.got) {
          out.push(`Remember the article: “${expected}”. Learning it with the noun is how you learn the gender.`);
          break;
        }
        const ga = opts.articles?.[i.want!];
        const gb = opts.articles?.[i.got!];
        if (ga && gb && ga in GENDER_NAME && gb in GENDER_NAME && ga !== gb)
          out.push(`Article: “${i.want}” (${GENDER_NAME[ga]}) is needed here, not “${i.got}” (${GENDER_NAME[gb]}).`);
        else out.push(`Article: use “${i.want}” here, not “${i.got}”.`);
        break;
      }
      case 'ending':
        out.push(`Check the ending: “${i.want}”, not “${i.got}”. The ending shows who does the action or agrees with the noun.`);
        break;
      case 'letter':
        out.push(
          i.want!.includes('ñ')
            ? `“${i.want}” needs ñ — “${i.got}” is a different word (año = year).`
            : `“${i.want}” needs its umlaut (or type ${transliterateGerman(i.want!)}) — “${i.got}” is a different word.`,
        );
        break;
      case 'otherWord':
        out.push(`“${i.got}” is a different word; here it should be “${i.want}”.`);
        break;
      case 'wrongWord':
        out.push(`“${i.got}” should be “${i.want}”.`);
        break;
      case 'missingWord':
        out.push(`Missing word: “${i.want}”.`);
        break;
      case 'extraWord':
        out.push(`Extra word: “${i.got}” isn't needed.`);
        break;
      default:
        break;
    }
  }
  if (verdict === 'wrong') out.push(`Correct answer: ${expected}`);
  return out;
}

/** Suggested FSRS grade from a check result and whether a hint was used. */
export function gradeFromResult(r: CheckResult, usedHint: boolean): 1 | 2 | 3 {
  if (r.verdict === 'wrong') return 1;
  if (r.verdict === 'almost' || usedHint) return 2;
  return 3;
}
