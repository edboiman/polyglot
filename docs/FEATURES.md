# Features: implemented and planned

## Implemented

**Platform**
- React + TypeScript PWA, mobile-first, light/dark themes, text-size and reduced-motion settings.
- Installable (manifest + icons), offline app shell and all lessons via service worker.
- IndexedDB storage with localStorage and in-memory fallbacks; automatic saving (debounced and on page hide); lesson position autosaved and resumable.
- Schema versioning with migrations and a pre-migration safety copy; data from newer versions is preserved.
- Backup export/import with validation and a safety copy of replaced data; API key excluded from backups by default.
- Hash routing for GitHub Pages; GitHub Actions deploy workflow.

**Courses** — Spanish, German, French, CEFR A1
- 8 units × 2–3 lessons (17 per language), situational: greetings, family, numbers/time, food, shopping, travel/directions, work/school/hobbies, health/past/plans.
- ≈ 160 vocabulary items and ≈ 85 sentences per language, each with alternatives and grammar tags; nouns always taught with articles.
- 6–7 grammar workshop topics, 4 branching conversations and 3 graded stories per language.

**Learning engine**
- FSRS-5 scheduling; recognition, production and sentence cards; learning steps; mature/young/learning states.
- Lesson builder: intro, dialogue, word cards, recognition, production, sentence work, interleaved review, speaking, final check, recap.
- Adaptive re-queueing, multiple-choice skipping, hint fading.
- Answer checker with alternatives, typo/accent tolerance, protected grammatical words and specific error diagnosis; learner override.
- Error tracking by concept, recurring-error help, weakness detection and remediation recommendations.
- Seven-skill mastery tracking with documented thresholds.

**Modes**: guided lessons; smart review (due, difficult, recently missed, saved words, grammar review, workload forecast); conversations (typed, spoken or option-based; optional AI free chat); listening lab (word recognition, listen-and-type, sentences, dialogues, slow/normal, transcript reveal); grammar workshop; reading with tap-to-translate and save-to-review.

**Motivation and progress**: daily XP goal, optional forgiving streak, rotating weekly challenge, 11 evidence-based badges; progress dashboard with time, lessons, reviews, vocabulary, estimated vs observed retention, weekly accuracy, skills, weaknesses, A1 coverage, 4-week activity and per-language totals.

## Planned enhancements

- Per-learner FSRS weight optimisation from the review log.
- A2 and B1 units; more conversations and stories per unit.
- Recorded native-speaker audio as an alternative to device voices.
- Pronunciation scoring with a real phoneme-level service (opt-in), clearly separate from recognition.
- Placement test and periodic proficiency checks to support an efficacy study.
- Optional cloud sync between devices.
- Optional, gentle reminders (opt-in, user-chosen time).
- Learner-created vocabulary collections.
- Native-speaker review pass for all content.

## Verification performed for this build (1.1.0)

- 134 automated tests pass, including regression tests for every finding in the October 2026 review (see `CHANGELOG.md`).
- Strict TypeScript check passes for engine, data, storage, AI and audio code against the ES2021 library; UI code was additionally checked with minimal React type stand-ins.
- Browser acceptance checks (headless Chromium, 393 × 851, served under `/polyglot/` like a GitHub Pages project site):
  - One online visit → service worker precached all 9 files → HTTP cache cleared → offline reload renders Home and opens a lesson.
  - Lesson stopped after 6 answers, page reloaded, resumed: the resume prompt reported 6 answers; the stored best score (9.09%) matched the recap (9%); the resume record was cleared on completion.
  - Malformed stored data (`cards: null`) shows the recovery screen; the stored data was left byte-for-byte unchanged and a quarantine copy was kept when starting a new profile.
  - A malformed percent-encoded route does not crash.
  - Full lesson walkthrough, persistence after reload, grammar workshop, story tap-to-translate and save-to-review, full scripted conversation: no console errors.

**Known gaps in verification**
- The sandbox still has no access to the npm registry, so `npm install`, a real Vite build, Vitest itself, `npm audit` and a lockfile could not be produced here. The build was verified with esbuild (Vite's bundler) plus the same service-worker generator, and tests ran under Bun's test runner via the Vitest API. The first GitHub Actions run (or `npm run verify` locally) is the first full toolchain run; please send any error output.
- Dependency versions were set to current major releases, but `npm audit` must be re-run against the resolved tree and the lockfile committed.
- Real-device speech synthesis/recognition and paid AI endpoints were not tested.
- Course content still needs a native-speaker review.
