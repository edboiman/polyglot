# Content guide

All teaching content is TypeScript data in `src/data/<lang>/`. The engine and UI need no changes to add lessons, units or a new language.

## Lessons (`units.ts`)

```ts
{
  title: 'At the café',
  situation: 'Ordering drinks and asking for the bill',
  intro: 'One or two sentences shown on the lesson start screen.',
  tip: { title: 'Partitive articles', body: 'Short rule with examples.' },
  grammar: ['fr.partitive'],              // concept ids (see extras.ts labels)
  dialogue: [['Hugo', 'Je voudrais un thé.', 'I would like a tea.']],
  vocab: [
    // [lemma, English, part of speech, options]
    ['eau', 'water', 'nf', { note: 'Feminine: l\'eau.' }],
    ['je voudrais', 'I would like', 'ph', { enAlt: ["i'd like"] }],
  ],
  sentences: [
    // [target, English, options]
    ['Tu veux de l\'eau ?', 'Do you want water?', {
      cloze: 'de', hint: '(some)',       // word blanked for sentence completion
      alt: ['Veux-tu de l\'eau ?'],      // other accepted target versions
      enAlt: ['Would you like water?'],  // other accepted English versions
      gr: ['fr.partitive'],              // concepts this sentence tests
    }],
  ],
}
```

Part-of-speech codes: `nm`, `nf`, `nn` (German neuter), `npl` for nouns (gender is taught with the article automatically: *el/la*, *der/die/das*, *le/la/l'*); `v`, `adj`, `adv`, `pron`, `det`, `prep`, `conj`, `num`, `int`, `ph`.

Useful vocabulary options: `alt` (accepted spellings), `enAlt`, `pl` (plural), `pron` (pronunciation help), `note`, `ex` (example `[target, English]`), `art` (override article, e.g. Spanish `el agua`), `id` (when two entries share a lemma), `d` (difficulty 1–5).

## Grammar topics, conversations and stories (`extras.ts`)

- **Grammar topic:** `concepts` it remediates, `unlockAfter` lesson id, rule `points` with examples, and `drills` (prompt containing `___`, accepted `answers`, optional `choices`, `explain`).
- **Conversation:** nodes with an NPC line, the learner's task, and replies. Each reply has a model answer, optional `accept` phrasings, and a `pattern` (regex on the lower-cased, accent-free answer) that recognises on-topic free answers. Mark final nodes `end: true`.
- **Story:** paragraphs with aligned translations, a glossary for words not in the vocabulary bank, and multiple-choice questions.
- **Concept labels:** every concept id used anywhere needs a human-readable label.

## Quality checks

Run `npm test`. The curriculum suite fails if: ids repeat; a cloze word is not in its sentence; a sentence or its alternatives are not accepted by the checker; a drill's answer is not among its choices; a conversation node is unreachable or a model reply does not match its own pattern; a story question index is invalid; fewer than 70% of story words can be looked up; or a concept lacks a label.

Automated checks cannot verify that a translation is natural. Have a fluent speaker review new content before release; avoid machine-generated grammar explanations.

## Adding a language

1. Add the code to `LangCode` in `src/data/types.ts`.
2. Create `src/data/<code>/units.ts` and `extras.ts`.
3. Register it in `COURSES` (`src/data/courses.ts`) with its speech locale, article list and common-word glossary; add default article rules in `articleFor` (`build.ts`) and protected short words in `validate.ts`.
4. Add accent keys in `ExerciseView.tsx` (`ACCENTS`), a theme colour in `styles.css`, and the language to `emptyLang`/`initialState` in `model.ts` and `LANGS` in `persistence.ts` (with a schema migration).

## Adding levels (A2, B1…)

Append units to a language's `units.ts` with `cefr: 'A2'`. Lessons unlock in order; grammar topics, conversations and stories unlock via `unlockAfter`.
