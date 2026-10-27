# Changelog

## 1.2.0 — spoken-first learning

- New setting **Profile › Typing exercises**, **off by default**. With it off, nothing asks you to type:
  - Producing a word or sentence becomes **say it aloud**. Speech recognition checks it when available. Otherwise (or if recognition doesn't match) you hear the model answer and rate yourself: Didn't get it / With effort / Got it / Easy.
  - Translating into English, dictation and comprehension become **choose the meaning** (read or heard).
  - Grammar workshop drills become multiple choice; conversations use the microphone and reply options.
- Each spoken or choice exercise practises the same memory card as its typed version, so switching the setting never disrupts your review schedule.
- Self-rated answers schedule reviews but never count toward mastery; recognition-checked answers count as speaking and vocabulary production.

## 1.1.0 — fixes from the October 2026 developer review

Each item refers to the numbered finding in the review. Regression tests for these live in `src/test/regressions.test.ts` and `src/test/persistence.test.ts`.

**High priority**
1. **CI.** The workflow no longer requires a lockfile for caching: it uses `npm ci` when `package-lock.json` is committed, otherwise installs with a visible warning. It now runs `typecheck`, tests, a production-dependency audit and a (non-blocking) dev-dependency audit before building. Build and deploy jobs have separate, minimal permissions. Node 22.
2. **Review identity.** Review exercises keep the card they were generated from, so a sentence reviewed as dictation is rescheduled like any other format.
3. **Lesson score.** Session state moved to a pure, tested snapshot (`src/engine/sessionState.ts`). Completion uses the snapshot that includes the final answer, runs once, and an unanswered session scores 0 instead of 100%.
4. **Resume.** The full snapshot (queue, position, scores, answered items, re-queues, missed items) is saved and restored; it is validated before use, and items answered before a reload are never rewarded twice.
5. **Offline.** The service worker is generated at build time with a precache list of every built file, so one online visit is enough to work offline. Profile shows whether the offline copy is ready.
6. **Caches.** Cache names are namespaced by app and deployment path; only this app's own old caches are deleted.
7. **Imports.** Full runtime validation of every collection, number range, enum and identifier; malformed files are rejected before anything is written; a 10 MB limit; cards for removed content are skipped and reported. A recovery screen replaces blank-screen failures, an error boundary covers render errors, and "Undo last import" restores the previous data.
8. **AI keys.** Backups never contain AI settings, and importing never changes them. A key is bound to the endpoint it was entered for and is never sent elsewhere; changing the endpoint clears it. Endpoints must be HTTPS (plain HTTP only for this device's localhost).

**Accuracy**
9. Multiple-choice distractors exclude every meaning the app accepts for the target word; one shared generator for lessons and the Listening Lab.
10. Language-aware tolerance (ñ, umlauts) and rejection of slips that produce another real word. Near misses, assisted answers and retries are recorded separately and do not count as accurate for mastery.
11. Scripted conversations no longer record writing/speaking attempts.

**Engineering**
12. Unreadable or damaged stored data is quarantined and nothing is written until the learner chooses an action.
13. Toolchain updated (Vite 7, Vitest 3, plugin-react 5, TypeScript 5.8); `fake-indexeddb` removed as unused.
14. `.at()` removed; `typecheck` covers app and tests and runs in CI.
15. One shared review budget; new-word target clearly advisory and counted once per word.

**Resilience:** revision-checked saves stop a stale tab from overwriting newer progress; data from a newer app version is read-only; unknown future languages are preserved; safe route decoding; AI requests time out after 30 s, are cancelled on leaving, and send bounded history; microphone capture and multi-line playback stop when leaving a screen; lessons wait for device voices before planning audio exercises.
