# Learning-science decisions

This document explains what Polyglot does and why, and where the evidence is weaker than marketing for language apps usually admits.

## Honest framing

Research on language-learning apps is thin and often funded by the companies tested. The best-supported findings are about *learning mechanisms* (retrieval practice, spacing, feedback), not about apps as products. Polyglot therefore implements those mechanisms carefully and measures what learners actually demonstrate — but it does not claim to be "proven". A controlled study (pre/post proficiency test with a comparison group) would be needed for that.

The one consistent app finding is that gains track time on task and that many learners drop out. Several design choices below exist mainly to keep sessions short and sustainable.

## 1. Spaced repetition (FSRS-5) — `src/engine/fsrs.ts`

Each studied item has one or more **memory cards**: `r` (recognise: target → English), `p` (produce: English → target) and `s` (sentence pattern). Each card stores:

- **Stability S** — days until predicted recall falls to 90%.
- **Difficulty D** — 1–10.

Predicted recall after *t* days: `R = (1 + 19/81 · t/S)^-0.5`. After each answer, the grade (1 Again, 2 Hard, 3 Good, 4 Easy) updates S and D with the published FSRS-5 equations and default weights; the next review is scheduled when R reaches the learner's target (85/90/95%, default 90%).

How answers become grades (`gradeFromResult`):

| Answer | Grade |
| --- | --- |
| Wrong | 1 Again — card returns in ~5 minutes, lapse counted |
| Accepted with a note (missing accent, typo, missing article) or a hint was used | 2 Hard |
| Correct | 3 Good |

A second attempt at a re-queued item is capped at Hard so a corrected mistake does not look like solid knowledge.

Every review format keeps the identity of the card it came from: a sentence card shown as dictation, completion or translation is rescheduled the same way.

- Difficult items come back sooner (low S, high D); well-known items are spaced further apart.
- New, learning, young and **mature** (interval ≥ 21 days) cards are tracked separately.
- Each language has its own cards; nothing is shared.
- Nothing is "due" just because the app was opened: only cards whose due time has passed, plus words the learner explicitly saved.
- Workload controls, with clear definitions:
  - **Daily target for new words** is advisory. Each word counts once, when it is first introduced. Once reached, Home recommends review or reading instead; lessons stay open.
  - **Review limit per day** is a cap. Every answered card whose due time had passed counts (review, learning and relearning alike). Home, Practice and Review share one calculation, so none of them offers reviews once the cap is reached.
  - **Target recall** sets the scheduler's desired retention. A 7-day forecast shows upcoming reviews.

Limitations: default weights are population-level; per-learner weight optimisation is a planned enhancement. "Easy" is not assigned automatically.

## 2. Retrieval over recognition — `src/engine/session.ts`

Lessons are built so that most graded items require producing an answer from memory: English → target typing, target → English comprehension, sentence completion, dictation, sentence translation, and speaking. Multiple choice appears only once per new word as first familiarity, and is dropped for the rest of a lesson if the first six answers are all correct. In smart review, recognition cards are tested by typing (no options).

**Hint fading:** production items in lessons offer progressive hints (first letters → more letters). In review, hints are offered only while a card's stability is below 2 days and it has fewer than 4 repetitions. Final checks never offer hints or word banks. Word banks are used only in units 1–2.

## 3. Comprehensible input

Every lesson opens with a short dialogue in which the new language appears in context, with tap-to-translate on every word and translations shown on tap (configurable). Stories reuse vocabulary from earlier lessons and unlock only after the lessons they depend on; glossaries cover remaining words. Comprehension questions are in the target language with English explanations.

## 4. Interleaving

Each lesson inserts up to three review items from **earlier lessons that the learner has actually studied**, weakest (lowest predicted recall) first. Items from the current lesson or from untaught lessons are never used, so interleaving cannot introduce new material. Review sessions shuffle items and spread repeats of the same item apart, and the exercise format for a card varies with its repetition count (e.g. a sentence card alternates completion, dictation and translation).

## 5. Feedback and error correction — `src/engine/validate.ts`

The checker normalises case, punctuation, apostrophes and English contractions, accepts listed alternatives and Spanish pronoun-drop, accepts `ae/oe/ue/ss` for German umlauts and ß, and accepts missing accents and small typos *with a note*. It never treats a change in a short grammatical word (articles, pronouns, forms of to be) as a typo.

Tolerance is language-aware. Spanish ñ is never treated as an optional accent (año ≠ ano). German ä/ö/ü/ß are accepted as ae/oe/ue/ss, but a dropped umlaut is a different letter (schon ≠ schön). And any slip that produces a different real word of the language (poison for poisson) is marked wrong, using a list of every word form in the course plus known look-alike pairs.

It aligns the answer word by word with the closest accepted answer and names each difference:

- article (with gender: "el (masculine) … needed here, not la"),
- ending (verb conjugation or agreement: "habla, not hablo"),
- missing / extra word, word order, accent, spelling slip.

Learners can mark an answer as also correct before continuing (graded Hard), because no checker anticipates every legitimate phrasing.

**Recurring errors:** errors are logged against grammar concepts (e.g. `de.dative`). When the same concept was missed twice in 14 days, feedback adds the rule and extra examples. A concept becomes a **weakness** with ≥ 3 errors in 14 days, unless correct answers clearly outnumber them or 5 later correct answers show it is fixed. Weaknesses drive recommendations to the matching grammar workshop.

Early speaking is never penalised: unrecognised speech does not create a failed memory card.

## 6. Mastery is demonstrated, not assumed — `src/engine/analytics.ts`

Seven skills are tracked from automatically graded answers: vocabulary recognition, vocabulary production, listening, reading, grammar, writing and speaking.

| Level | Rule |
| --- | --- |
| Developing | ≥ 5 answers |
| Proficient | ≥ 20 answers, ≥ 80% correct over the last 30, on ≥ 2 days |
| Mastered | ≥ 40 answers, ≥ 90% correct over the last 30, on ≥ 3 days |

Only exact, unaided first attempts count as accurate. Answers accepted with a note (missing accent, small typo, missing article) are recorded as *near*, answers with a hint, transcript or learner override as *assisted*, and second tries after a correction as *retry* (ignored). Self-assessed speaking ("I said it") is recorded but never counts.

Scripted conversations do not add to writing or speaking scores at all: matching a reply's topic advances the conversation but is not a check of the language used. Grammar workshop drills record grammar accuracy and errors; the scheduled grammar reviews come from lesson sentences, not from the drills themselves. Lesson completion is shown as course coverage only. The Progress screen states that it is not CEFR certification.

**Retention** is shown twice, clearly labelled: *estimated* (mean predicted recall from the model) and *observed* (share of scheduled reviews answered correctly in 30 days).

## 7. Speaking and audio — `src/audio/speech.ts`

- Text-to-speech uses the device's voices, labelled as synthesised. Slow playback is available everywhere audio is.
- Speech recognition compares the recogniser's transcript alternatives with the expected sentence. Feedback says whether the recogniser *understood the words* and shows what it heard. It explicitly does not score accent, phonemes or fluency.
- Everything works without audio or microphone: listening items are omitted when no voice exists, and speaking items fall back to unscored self-practice.

## 8. Adaptation rules — `src/engine/recommend.ts`

Ordered, documented rules: resume an unfinished lesson → review first if ≥ 10 items are due → work on a current grammar weakness → new lesson if today's new-word budget allows → remaining reviews → a story or conversation. Each recommendation shows its reason on Home.

Within a lesson: a missed item is re-queued once a few steps later (a missed production item first shows its word card again; a missed multiple-choice item returns as a typed recall). Six correct first answers skip remaining multiple choice.

## 9. Motivation without manipulation

XP is earned only for correct retrieval, with more for production, scheduled reviews and final checks; reading screens and repeated multiple choice earn little or nothing, and repeated lessons give a small completion bonus. Streaks are optional and forgive one missed day per week automatically. There are no notifications, currencies, purchases, or loss-framing. Badges reward evidence of learning (e.g. "Retention keeper" requires ≥ 85% on 50+ scheduled reviews).
