/**
 * Content model. Everything a learner sees is defined as data in this shape,
 * so new languages or levels are added by writing data, not code.
 */

export type LangCode = 'es' | 'de' | 'fr';
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Gender = 'm' | 'f' | 'n' | 'pl';
export type Pos =
  | 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'det' | 'prep' | 'conj'
  | 'num' | 'interj' | 'phrase';

/** A vocabulary entry. `id` doubles as the review identifier. */
export interface VocabItem {
  id: string;
  lang: LangCode;
  /** Dictionary form as it should be produced (German nouns without article). */
  lemma: string;
  /** Main English meaning, used as the prompt for production. */
  en: string;
  /** Other acceptable English meanings when translating into English. */
  enAlt?: string[];
  /** Other acceptable target-language forms (spelling variants, synonyms). */
  alt?: string[];
  pos: Pos;
  gender?: Gender;
  /** German: plural form; French/Spanish: irregular plural if any. */
  plural?: string;
  /** Definite article to teach with a noun (computed, overridable). */
  art?: string;
  /** Simplified pronunciation help, written for English speakers. */
  pron?: string;
  /** Free-form grammatical note shown on the word card. */
  note?: string;
  example?: { t: string; en: string };
  level: Cefr;
  /** Difficulty 1 (easy cognate) - 5 (hard). */
  difficulty: number;
  grammar?: string[];
  /** Lesson that introduces this item. */
  lessonId: string;
}

/** A sentence used for comprehension, cloze, dictation and translation. */
export interface Sentence {
  id: string;
  lang: LangCode;
  t: string;
  /** Other acceptable target-language versions. */
  alt?: string[];
  en: string;
  enAlt?: string[];
  /** Word (exact form in `t`) to blank out for sentence completion. */
  cloze?: string;
  /** Hint shown with the blank, e.g. the infinitive "(ser)". */
  clozeHint?: string;
  /** Other forms accepted in the blank. */
  clozeAlt?: string[];
  grammar?: string[];
  lessonId: string;
  level: Cefr;
}

export interface DialogueLine {
  who: string;
  t: string;
  en: string;
}

export interface Lesson {
  id: string;
  lang: LangCode;
  unit: number;
  index: number;
  title: string;
  /** Practical situation the lesson serves. */
  situation: string;
  cefr: Cefr;
  intro: string;
  /** Short grammar/usage explanation tied to the lesson. */
  tip?: { title: string; body: string };
  dialogue: DialogueLine[];
  vocab: VocabItem[];
  sentences: Sentence[];
  grammar: string[];
  /** Estimated minutes. */
  minutes: number;
}

export interface Unit {
  lang: LangCode;
  number: number;
  title: string;
  cefr: Cefr;
  theme: string;
  lessons: Lesson[];
}

/** A focused grammar exercise item. */
export interface GrammarDrill {
  id: string;
  prompt: string;
  /** English meaning of the completed sentence, for context. */
  en?: string;
  answers: string[];
  /** If set, rendered as choices (used for early familiarity). */
  choices?: string[];
  explain: string;
}

export interface GrammarTopic {
  id: string;
  lang: LangCode;
  title: string;
  level: Cefr;
  /** Error-tracking concepts this topic remediates. */
  concepts: string[];
  /** Lesson after which this topic is available. */
  unlockAfter: string;
  summary: string;
  /** Short explanation blocks: rule, then examples. */
  points: { rule: string; examples: { t: string; en: string }[] }[];
  drills: GrammarDrill[];
}

export interface ConversationReply {
  /** The model answer, shown in "show options" mode. */
  t: string;
  en: string;
  /** Other phrasings accepted when typed or spoken. */
  accept?: string[];
  /**
   * Regular expression (tested against the lower-cased, accent-free answer)
   * that recognises an on-topic free answer, e.g. "(me llamo|soy) \\w+".
   */
  pattern?: string;
  next: string;
  feedback?: string;
}

export interface ConversationNode {
  id: string;
  npc: { t: string; en: string };
  /** What the learner is trying to say, in English. */
  task?: string;
  replies: ConversationReply[];
  end?: boolean;
}

export interface Conversation {
  id: string;
  lang: LangCode;
  title: string;
  situation: string;
  level: Cefr;
  unlockAfter: string;
  npcName: string;
  start: string;
  nodes: ConversationNode[];
}

export interface StoryQuestion {
  q: string;
  choices: string[];
  answer: number;
  explain: string;
}

export interface Story {
  id: string;
  lang: LangCode;
  title: string;
  level: Cefr;
  unlockAfter: string;
  /** Paragraphs in the target language. */
  paragraphs: string[];
  translation: string[];
  /** Glosses for words not in the vocabulary bank (lower-case form → meaning). */
  glossary: Record<string, string>;
  questions: StoryQuestion[];
}

export interface Course {
  lang: LangCode;
  name: string;
  nativeName: string;
  units: Unit[];
  grammar: GrammarTopic[];
  conversations: Conversation[];
  stories: Story[];
  /** Words that the answer checker treats as articles (for gender feedback). */
  articles: Record<string, Gender | 'indef' | 'other'>;
  /** Human-readable names for grammar concepts used in error tracking. */
  conceptLabels: Record<string, string>;
  speechLocale: string;
}
