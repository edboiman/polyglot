# Polyglot

A mobile-first Progressive Web App for English speakers learning **Spanish, German and French**, built on learning-science principles: FSRS spaced repetition, retrieval practice, comprehensible input, interleaving and specific error feedback.

No account, no server, no paid services. Progress is stored on the device (IndexedDB) and can be exported as a backup file. Lessons work offline once the app has been opened.

## What is included

- **A1 starter courses** for all three languages: 8 units, 17 lessons each (≈ 160 words/phrases and ≈ 85 graded sentences per language), organised by CEFR and by situation.
- **Six modes:** guided lessons, smart review, scripted branching conversations (optional AI partner), listening lab, grammar workshop (6–7 topics per language), graded stories with tap-to-translate (3 per language).
- **FSRS-5 scheduler** with per-language memory cards, daily new-word and review limits, and adjustable target recall.
- **Answer checking** that accepts alternatives, contractions, missing accents and small typos, but never treats el/la, den/dem or es/est as typos — and names the specific mistake.
- **Progress** that separates estimated retention (model) from observed recall (your answers), and mastery levels that require sustained accuracy over several days.

See [`docs/FEATURES.md`](docs/FEATURES.md) for the full implemented-vs-planned list, and [`docs/LEARNING_SCIENCE.md`](docs/LEARNING_SCIENCE.md) for the design rationale.

## Run locally

Requires Node.js 20.19 or newer (22 recommended).

```bash
npm install        # also creates package-lock.json — commit it
npm run dev        # http://localhost:5173
npm test           # unit and regression tests
npm run typecheck  # TypeScript check (app and tests)
npm run build      # production build in dist/ (includes the generated service worker)
npm run preview    # serve the production build
npm run verify     # typecheck + tests + build, as CI does
```

The service worker is only registered in production builds (`npm run build && npm run preview`).

## Deploy to GitHub Pages

1. Put the **contents** of the `polyglot` folder at the root of a GitHub repository (branch `main`), so `package.json`, `index.html`, `src/`, `public/`, `scripts/` and `.github/workflows/deploy.yml` sit at the top level. The `.github` folder is hidden by default on macOS and Windows; make sure it is included.
2. **Recommended:** run `npm install` once on your computer and commit the generated `package-lock.json`. CI then uses `npm ci` for reproducible, cached builds. Without it the workflow still runs, with a warning, using the latest compatible versions.
3. In the repository: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
4. The included workflow type-checks, audits, tests, builds and publishes on every push to `main`. The site appears at `https://<user>.github.io/<repo>/`.

Use either this workflow or a manually published `dist/` folder — not both.

No configuration is needed for the sub-path: the build uses relative asset paths (`base: './'`) and hash-based routes (`#/learn`), so refreshes and deep links work on Pages without rewrites. To deploy manually instead, run `npm run build` and publish the `dist/` folder to any static host.

## Project structure

```
src/
  data/            Curriculum as data (types, authoring helpers, es/ de/ fr/)
  engine/          Pure, tested logic
    fsrs.ts          FSRS-5 scheduler
    validate.ts      Answer normalisation, tolerance and error diagnosis
    model.ts         Learner model and update functions
    session.ts       Lesson builder, review queue, interleaving
    analytics.ts     Mastery, retention, workload, weaknesses, streaks
    recommend.ts     Rule-based next-activity recommendations
  storage/         IndexedDB / localStorage backends, migrations, backups
  audio/           Web Speech API: text-to-speech and speech recognition
  ai/              Optional OpenAI-compatible conversation partner
  ui/              React screens and shared exercise components
  test/            Test suites
public/            Manifest, service worker, icons
docs/              Learning-science notes, content guide, feature list
```

## Adding content or a language

Courses are plain TypeScript data. See [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md). The curriculum test suite checks every new lesson automatically (unique ids, cloze words present, conversations reachable, model answers accepted by the checker, story glossary coverage).

## Privacy

Everything stays in your browser. Two optional features can send data elsewhere, and both say so in Profile: the browser's own speech recognition (some browsers process audio on their servers), and the AI partner, which only contacts the endpoint you configure.

**About the AI partner on GitHub Pages:** Pages hosts static files only, so it cannot hide a provider key or run a model. The endpoint must be HTTPS and must allow the site's origin through CORS. A key is stored only in your browser, is bound to the endpoint you entered it for, and is never included in backups. A phone's `localhost` is the phone itself, so a model running on your computer is not reachable from your phone at that address. Never commit keys to the repository.
