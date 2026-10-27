/**
 * Course registry and content lookups. Adding a language means adding a
 * folder with units/extras and registering it here — the learning engine
 * and UI are language-agnostic.
 */

import { buildUnits, nounForm } from './build';
import { normalize } from '../engine/validate';
import type { Conversation, Course, GrammarTopic, LangCode, Lesson, Sentence, Story, VocabItem } from './types';
import { esUnits } from './es/units';
import { esConceptLabels, esConversations, esGrammar, esStories } from './es/extras';
import { deUnits } from './de/units';
import { deConceptLabels, deConversations, deGrammar, deStories } from './de/extras';
import { frUnits } from './fr/units';
import { frConceptLabels, frConversations, frGrammar, frStories } from './fr/extras';

export const COURSES: Record<LangCode, Course> = {
  es: {
    lang: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    units: buildUnits('es', esUnits),
    grammar: esGrammar,
    conversations: esConversations,
    stories: esStories,
    conceptLabels: esConceptLabels,
    speechLocale: 'es-ES',
    articles: { el: 'm', la: 'f', los: 'm', las: 'f', un: 'm', una: 'f', unos: 'm', unas: 'f', al: 'other', del: 'other' },
  },
  de: {
    lang: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    units: buildUnits('de', deUnits),
    grammar: deGrammar,
    conversations: deConversations,
    stories: deStories,
    conceptLabels: deConceptLabels,
    speechLocale: 'de-DE',
    articles: {
      der: 'm', die: 'f', das: 'n', den: 'other', dem: 'other', des: 'other',
      ein: 'other', eine: 'other', einen: 'other', einem: 'other', einer: 'other', eines: 'other',
      kein: 'other', keine: 'other', keinen: 'other', keinem: 'other',
      mein: 'other', meine: 'other', meinen: 'other', meinem: 'other', meiner: 'other',
      dieser: 'other', diese: 'other', dieses: 'other', diesen: 'other', diesem: 'other',
      zum: 'other', zur: 'other', im: 'other', am: 'other',
    },
  },
  fr: {
    lang: 'fr',
    name: 'French',
    nativeName: 'Français',
    units: buildUnits('fr', frUnits),
    grammar: frGrammar,
    conversations: frConversations,
    stories: frStories,
    conceptLabels: frConceptLabels,
    speechLocale: 'fr-FR',
    articles: {
      le: 'm', la: 'f', les: 'other', "l'": 'other', un: 'm', une: 'f', des: 'other',
      du: 'other', de: 'other', "d'": 'other', au: 'other', aux: 'other',
      mon: 'other', ma: 'other', mes: 'other', ce: 'other', cet: 'other', cette: 'other', ces: 'other',
    },
  },
};

export const LANGS: LangCode[] = ['es', 'de', 'fr'];

/**
 * Frequent function words and inflected forms, so tap-to-translate works on
 * real text and not only on dictionary forms.
 */
const COMMON: Record<LangCode, Record<string, string>> = {
  es: {
    el: 'the (masculine)', la: 'the (feminine)', los: 'the (masculine plural)', las: 'the (feminine plural)',
    un: 'a (masculine)', una: 'a (feminine)', unos: 'some (masculine)', unas: 'some (feminine)',
    al: 'to the (a + el)', del: 'of the (de + el)', a: 'to, at', y: 'and', o: 'or', que: 'that, which', por: 'for, by, through', para: 'for, in order to',
    me: 'me, myself', te: 'you, yourself', se: 'himself / herself / themselves', llamo: 'I call (me llamo = my name is)', llama: 'calls (se llama = is called)',
    es: 'is (ser)', son: 'are (ser)', somos: 'we are (ser)', están: 'they are (estar)', estás: 'you are (estar)', estamos: 'we are (estar)',
    va: 'goes (ir)', vas: 'you go (ir)', van: 'they go (ir)', levanto: 'I get up (me levanto)', sale: 'leaves (salir)',
    euros: 'euros', mis: 'my (plural)', tu: 'your', su: 'his / her / their', muy: 'very', más: 'more', hace: 'does, makes',
  },
  de: {
    der: 'the (masculine; also feminine dative)', die: 'the (feminine / plural)', das: 'the (neuter); that', den: 'the (masculine accusative)', dem: 'the (dative)',
    ein: 'a (masc./neuter)', eine: 'a (feminine)', einen: 'a (masculine accusative)', einem: 'a (dative)', es: 'it', wir: 'we', ihr: 'you (plural); her',
    ist: 'is (sein)', sind: 'are (sein)', haben: 'have (haben)', heiße: 'am called (heißen)', heißt: 'is called (heißen)', komme: 'come (kommen)', kommt: 'comes',
    trinkt: 'drinks (trinken)', isst: 'eats (essen)', uhr: "o'clock", am: 'on the / at the (an + dem)', im: 'in the (in + dem)', zur: 'to the (zu + der)',
    auf: 'on, up', an: 'at, on', nicht: 'not', nächstes: 'next', meine: 'my', meiner: 'my (dative)', sehr: 'very', zu: 'to; too', von: 'from, of',
    spanien: 'Spain', deutschland: 'Germany', österreich: 'Austria',
  },
  fr: {
    le: 'the (masculine)', la: 'the (feminine)', les: 'the (plural)', un: 'a (masculine)', une: 'a (feminine)', des: 'some (plural)', du: 'some; of the (de + le)', au: 'to the (à + le)',
    et: 'and', ou: 'or', en: 'in, by', ne: 'not (ne … pas)', pas: 'not (ne … pas)', est: 'is (être)', sont: 'are (être)', a: 'has (avoir)', ont: 'have (avoir, they)',
    "m'appelle": 'call myself (je m\'appelle = my name is)', "s'appelle": 'is called', me: 'myself', se: 'himself / herself', lève: 'get up (se lever)',
    "n'ai": 'have not (ne + ai)', "n'est": 'is not (ne + est)', part: 'leaves (partir)', heures: "hours, o'clock", mange: 'eats (manger)', boit: 'drinks (boire)', coûte: 'costs (coûter)',
    euros: 'euros', vais: 'go (aller, I)', va: 'goes (aller)', allé: 'gone (aller, participle)', mangé: 'eaten (manger)', parlé: 'spoken (parler)', amis: 'friends',
    ma: 'my (feminine)', mes: 'my (plural)', année: 'year', prochaine: 'next (feminine)', mexique: 'Mexico', très: 'very',
  },
};

/* ------------------------------------------------------------- indexes */

interface Index {
  lessons: Lesson[];
  lessonById: Map<string, Lesson>;
  vocabById: Map<string, VocabItem>;
  sentenceById: Map<string, Sentence>;
  grammarById: Map<string, GrammarTopic>;
  conversationById: Map<string, Conversation>;
  storyById: Map<string, Story>;
  /** Lower-case word form → vocabulary items (for tap-to-translate). */
  forms: Map<string, VocabItem[]>;
}

const cache = new Map<LangCode, Index>();

export function index(lang: LangCode): Index {
  const hit = cache.get(lang);
  if (hit) return hit;
  const c = COURSES[lang];
  const lessons = c.units.flatMap((u) => u.lessons);
  const vocabById = new Map<string, VocabItem>();
  const sentenceById = new Map<string, Sentence>();
  const forms = new Map<string, VocabItem[]>();
  const addForm = (f: string, v: VocabItem) => {
    const k = f.toLowerCase().replace(/[¿?¡!.,…]/g, '').trim();
    if (!k) return;
    const arr = forms.get(k) ?? [];
    if (!arr.includes(v)) arr.push(v);
    forms.set(k, arr);
  };
  for (const l of lessons) {
    for (const v of l.vocab) {
      vocabById.set(v.id, v);
      addForm(v.lemma, v);
      for (const a of v.alt ?? []) addForm(a, v);
      if (v.plural) addForm(v.plural, v);
    }
    for (const s of l.sentences) sentenceById.set(s.id, s);
  }
  const idx: Index = {
    lessons,
    lessonById: new Map(lessons.map((l) => [l.id, l])),
    vocabById,
    sentenceById,
    grammarById: new Map(c.grammar.map((g) => [g.id, g])),
    conversationById: new Map(c.conversations.map((x) => [x.id, x])),
    storyById: new Map(c.stories.map((s) => [s.id, s])),
    forms,
  };
  cache.set(lang, idx);
  return idx;
}

/** Position of a lesson in the course (0-based), or -1. */
export function lessonOrder(lang: LangCode, lessonId: string): number {
  return index(lang).lessons.findIndex((l) => l.id === lessonId);
}

/** What the learner should type when producing a vocabulary item. */
export function productionForm(v: VocabItem): string {
  return nounForm(v);
}

/** English prompt for producing a vocabulary item. */
export function productionPrompt(v: VocabItem): string {
  if (v.pos === 'noun') return `the ${v.en}`;
  return v.en;
}

export function conceptLabel(lang: LangCode, concept: string): string {
  return COURSES[lang].conceptLabels[concept] ?? concept;
}

/** Grammar topic that remediates a concept, if any. */
export function topicForConcept(lang: LangCode, concept: string): GrammarTopic | undefined {
  return COURSES[lang].grammar.find((g) => g.concepts.includes(concept));
}

/**
 * Real words that look like common misspellings of course words. Typing one
 * of these is a different word, not a typo.
 */
const CONTRASTS: Record<LangCode, string[]> = {
  es: ['ano', 'anos', 'papa', 'pena', 'cana', 'sueno', 'mama', 'cayo', 'casa', 'caza', 'pero', 'perro', 'caro', 'carro', 'pelo', 'polo', 'mesa', 'misa', 'hola', 'ola'],
  de: ['schon', 'zahlen', 'mochte', 'konnen', 'mussen', 'wurde', 'drucken', 'schwul', 'zahl', 'stadt', 'statt', 'bar', 'kuchen', 'kuche', 'mann', 'man', 'ofen', 'offen'],
  fr: ['poison', 'dessert', 'desert', 'cheveux', 'chevaux', 'ou', 'sur', 'du', 'mur', 'cote', 'tache', 'pecher', 'jeune', 'jeûne', 'vers', 'verre', 'vert', 'mer', 'mère', 'faim', 'fin'],
};

const knownCache = new Map<LangCode, Set<string>>();

/** Every word form that appears anywhere in the course, plus known contrasts. */
export function knownWords(lang: LangCode): Set<string> {
  const hit = knownCache.get(lang);
  if (hit) return hit;
  const set = new Set<string>();
  const add = (text: string) => {
    for (const w of normalize(text, lang).split(' ')) if (w) set.add(w);
  };
  const idx = index(lang);
  const c = COURSES[lang];
  for (const v of idx.vocabById.values()) [v.lemma, ...(v.alt ?? []), v.plural ?? '', v.example?.t ?? ''].forEach(add);
  for (const s of idx.sentenceById.values()) [s.t, ...(s.alt ?? [])].forEach(add);
  for (const l of idx.lessons) l.dialogue.forEach((d) => add(d.t));
  for (const st of c.stories) {
    st.paragraphs.forEach(add);
    Object.keys(st.glossary).forEach(add);
  }
  Object.keys(COMMON[lang]).forEach(add);
  CONTRASTS[lang].forEach(add);
  knownCache.set(lang, set);
  return set;
}

export function lookupWord(lang: LangCode, token: string, extra?: Record<string, string>): { gloss: string; vocab?: VocabItem } | null {
  const clean = token.replace(/[¿?¡!.,;:«»"“”…()]/g, '').replace(/’/g, "'").trim();
  const k = clean.toLowerCase();
  if (!k) return null;
  const v = index(lang).forms.get(k)?.[0];
  if (extra?.[k]) return { gloss: extra[k], vocab: v };
  if (v) return { gloss: v.en + (v.gender && v.pos === 'noun' ? ` (${productionForm(v)})` : ''), vocab: v };
  const common = COMMON[lang][k];
  if (common) return { gloss: common };
  // French elision: l'hôtel → hôtel, j'ai → ai
  if (lang === 'fr' && k.includes("'")) {
    const rest = clean.split("'").pop()!;
    if (rest && rest !== clean) return lookupWord(lang, rest, extra);
  }
  // Capitalised words not in any list are treated as names (Ana, Madrid).
  if (/^\p{Lu}/u.test(clean) && lang !== 'de') return { gloss: '(name)' };
  if (/^\p{Lu}/u.test(clean) && lang === 'de' && !index(lang).forms.has(k)) return { gloss: '(name or noun not yet studied)' };
  return null;
}
