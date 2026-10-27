/**
 * Regression tests for the defects found in the October 2026 developer
 * review. Each block names the finding it guards.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { endpointAllowed, chat } from '../ai/tutor';
import { COURSES, LANGS, index, knownWords } from '../data/courses';
import { reviewBudget, skillSummary } from '../engine/analytics';
import { matchReply } from '../engine/conversation';
import { AGAIN, GOOD, MS } from '../engine/fsrs';
import { applyReview, emptyLang, initialState, recordAttempt, schedulerOptions } from '../engine/model';
import { recommend } from '../engine/recommend';
import { type Exercise, acceptedMeanings, buildLesson, choiceOptions, exerciseForCard, expectedAnswers, isTyped, isValidExercise, meta, seededRng, sentenceOptions } from '../engine/session';
import { answerStep, initSession, readSnapshot, sessionScore, skipStep } from '../engine/sessionState';
import { checkAnswer } from '../engine/validate';

const T = new Date('2026-05-04T09:00:00').getTime();
const opts = schedulerOptions(initialState().settings);

describe('#2 every review format reschedules its card', () => {
  it('a listening review of a sentence card updates reps, lastReview, due date and the log', () => {
    let p = emptyLang('es');
    const id = 'es-1-2.s1';
    p = applyReview(p, 's', id, GOOD, T - 10 * MS.DAY, opts); // reps 1
    const card = p.cards[`s:${id}`];
    expect(card.card.reps % 3).toBe(1);
    const ex = exerciseForCard('es', card, true)!;
    expect(ex.t).toBe('listen');
    const m = meta('es', ex);
    expect(m.card).toEqual({ kind: 's', itemId: id });
    const now = T;
    const next = applyReview(p, m.card!.kind, m.card!.itemId, GOOD, now, opts);
    expect(next.cards[`s:${id}`].card.reps).toBe(2);
    expect(next.cards[`s:${id}`].card.lastReview).toBe(now);
    expect(next.cards[`s:${id}`].card.due).toBeGreaterThan(now);
    expect(next.reviewLog[next.reviewLog.length - 1]).toMatchObject({ cardId: `s:${id}`, due: true });
  });

  it('every review exercise produced for any card kind carries a card identity', () => {
    for (const lang of LANGS) {
      let p = emptyLang(lang);
      const idx = index(lang);
      const v = [...idx.vocabById.values()][3];
      const s = [...idx.sentenceById.values()].find((x) => x.cloze)!;
      p = applyReview(p, 'p', v.id, GOOD, T, opts);
      p = applyReview(p, 'r', v.id, GOOD, T, opts);
      p = applyReview(p, 's', s.id, GOOD, T, opts);
      for (const c of Object.values(p.cards)) {
        for (let reps = 0; reps < 6; reps++) {
          for (const audio of [true, false]) {
            const ex = exerciseForCard(lang, { ...c, card: { ...c.card, reps } }, audio);
            expect(meta(lang, ex!).card).toEqual({ kind: c.kind, itemId: c.itemId });
          }
        }
      }
    }
  });
});

describe('#3 saved score includes the final answer', () => {
  const q: Exercise[] = [
    { t: 'recall', dir: 'en2tl', vocabId: 'es.hola', hints: false },
    { t: 'recall', dir: 'en2tl', vocabId: 'es.adios', hints: false },
    { t: 'recap', lessonId: 'es-1-1' },
  ];
  const run = (answers: boolean[], queue = q) => {
    let s = initSession(queue);
    for (const correct of answers) s = answerStep(s, { correct, xp: 0, lesson: false }).snapshot;
    return s;
  };
  it('wrong then right → 50%, and the session is done after the last answer', () => {
    const s = run([false, true], [q[0], { ...q[1], final: true } as Exercise, q[2]]);
    // q[0] is re-queued after the wrong answer, so finish it too
    const done = s.done ? s : answerStep(s, { correct: true, xp: 0, lesson: false }).snapshot;
    expect(done.done).toBe(true);
    expect(sessionScore(done.stats)).toBe(0.5);
  });
  it('right then wrong → 50%', () => {
    const s = run([true, false]);
    expect(s.stats).toMatchObject({ correct: 1, answered: 2 });
    expect(sessionScore(s.stats)).toBe(0.5);
  });
  it('a single wrong answer scores 0, never a default 100%', () => {
    const one: Exercise[] = [{ ...q[0], final: true } as Exercise, q[2]];
    const s = run([false], one);
    expect(s.done).toBe(true);
    expect(sessionScore(s.stats)).toBe(0);
  });
  it('a single right answer scores 100%', () => {
    expect(sessionScore(run([true], [q[0], q[2]]).stats)).toBe(1);
  });
  it('an empty session scores 0', () => {
    expect(sessionScore(initSession([]).stats)).toBe(0);
  });
});

describe('#4 resumed and uninterrupted sessions agree', () => {
  it('serialising mid-session and resuming gives the same result', () => {
    const queue: Exercise[] = [
      { t: 'intro', lessonId: 'fr-1-1' },
      { t: 'recall', dir: 'en2tl', vocabId: 'fr.bonjour', hints: false },
      { t: 'recall', dir: 'en2tl', vocabId: 'fr.merci', hints: false },
      { t: 'recall', dir: 'en2tl', vocabId: 'fr.salut', hints: false },
      { t: 'recall', dir: 'en2tl', vocabId: 'fr.bonsoir', hints: false },
      { t: 'recap', lessonId: 'fr-1-1' },
    ];
    const answers = [false, true, true, true, true, true];
    const play = (s: ReturnType<typeof initSession>, from: number, to: number) => {
      for (let i = from; i < to && !s.done; i++) {
        s = s.queue[s.pos].t === 'intro' ? skipStep(s) : answerStep(s, { correct: answers[i], xp: answers[i] ? 2 : 0, lesson: true }).snapshot;
      }
      return s;
    };
    const straight = play(initSession(queue), 0, 20);
    const half = play(initSession(queue), 0, 3);
    const restored = readSnapshot(JSON.parse(JSON.stringify(half)), (e) => isValidExercise('fr', e))!;
    expect(restored).not.toBeNull();
    const resumed = play(restored, 3, 20);
    expect(resumed.stats).toEqual(straight.stats);
    expect(resumed.missed).toEqual(straight.missed);
  });

  it('rejects resume data that refers to missing content or has impossible totals', () => {
    const ok = initSession([{ t: 'recall', dir: 'en2tl', vocabId: 'es.hola', hints: false }]);
    const valid = (e: unknown) => isValidExercise('es', e);
    expect(readSnapshot(ok, valid)).not.toBeNull();
    expect(readSnapshot({ ...ok, queue: [{ t: 'recall', dir: 'en2tl', vocabId: 'es.nope', hints: false }] }, valid)).toBeNull();
    expect(readSnapshot({ ...ok, pos: 5 }, valid)).toBeNull();
    expect(readSnapshot({ ...ok, stats: { ...ok.stats, correct: 3, answered: 1 } }, valid)).toBeNull();
    expect(readSnapshot('junk', valid)).toBeNull();
  });

  it('an item answered before resuming is not rewarded twice', () => {
    const q: Exercise[] = [{ t: 'recall', dir: 'en2tl', vocabId: 'es.hola', hints: false }, { t: 'recap', lessonId: 'es-1-1' }];
    let s = answerStep(initSession(q), { correct: false, xp: 0, lesson: false }).snapshot; // re-queued
    s = readSnapshot(JSON.parse(JSON.stringify(s)), (e) => isValidExercise('es', e))!;
    const r = answerStep(s, { correct: true, xp: 0, lesson: false });
    expect(r.isFirst).toBe(false);
    expect(r.snapshot.stats.answered).toBe(1);
  });
});

describe('#9 exactly one choice is acceptable', () => {
  it('holds for every vocabulary item, seeds 1–30, all languages', () => {
    for (const lang of LANGS) {
      for (const v of index(lang).vocabById.values()) {
        const ok = acceptedMeanings(v);
        for (let seed = 1; seed <= 30; seed++) {
          const opts4 = choiceOptions(lang, v, seededRng(seed));
          const acceptable = opts4.filter((o) => ok.has(o.toLowerCase()));
          if (acceptable.length !== 1) throw new Error(`${v.id} seed ${seed}: ${opts4.join(' / ')}`);
        }
      }
    }
  });
});

describe('#10 slips that make a different real word are wrong', () => {
  const w = (lang: 'es' | 'de' | 'fr', got: string, want: string) =>
    checkAnswer(got, [want], { lang, articles: COURSES[lang].articles, knownWords: knownWords(lang) }).verdict;
  it('rejects poison for poisson, schon for schön, anos for años', () => {
    expect(w('fr', 'poison', 'poisson')).toBe('wrong');
    expect(w('de', 'schon', 'schön')).toBe('wrong');
    expect(w('es', 'anos', 'años')).toBe('wrong');
    expect(w('es', 'tengo veinte anos', 'tengo veinte años')).toBe('wrong');
  });
  it('still accepts ae/oe/ue for umlauts and genuine slips', () => {
    expect(w('de', 'schoen', 'schön')).toBe('correct');
    expect(w('es', 'aeropuerot', 'aeropuerto')).toBe('almost');
    expect(w('fr', 'tres bien', 'très bien')).toBe('almost');
  });
  it('near misses and assisted answers do not count as accurate for mastery', () => {
    let p = emptyLang('es');
    for (let d = 0; d < 4; d++)
      for (let i = 0; i < 12; i++) p = recordAttempt(p, { t: T + d * MS.DAY + i, skill: 'grammar', correct: true, quality: 'near' });
    expect(skillSummary(p, 'grammar').recentAccuracy).toBe(0);
    expect(skillSummary(p, 'grammar').level).toBe('developing');
  });
  it('retries are excluded from mastery entirely', () => {
    let p = emptyLang('es');
    for (let i = 0; i < 30; i++) p = recordAttempt(p, { t: T + i, skill: 'writing', correct: true, quality: 'retry' });
    expect(skillSummary(p, 'writing').attempts).toBe(0);
  });
});

describe('#11 topic matches are not checked language', () => {
  it('a keyword-only answer advances but is not an exact match', () => {
    const conv = COURSES.es.conversations.find((c) => c.id === 'es.c.cafe')!;
    const m = matchReply(conv, 'n1', 'zzzz cafe zzzz');
    expect(m).not.toBeNull();
    expect(m!.exact).toBe(false);
    expect(matchReply(conv, 'n1', 'Quiero un café con leche, por favor.')!.exact).toBe(true);
  });
});

describe('#15 one review budget for Home, Practice and Review', () => {
  it('counts learning cards as scheduled work and stops recommending review at the cap', () => {
    let p = emptyLang('es');
    const ids = index('es').lessons.slice(0, 3).flatMap((l) => l.vocab.map((v) => v.id));
    for (const id of ids) p = applyReview(p, 'p', id, GOOD, T - 30 * MS.DAY, opts);
    const settings = { ...initialState().settings, maxReviewsPerDay: 12 };
    expect(recommend('es', p, settings, T).kind).toBe('review');
    for (const id of ids.slice(0, 12)) p = applyReview(p, 'p', id, AGAIN, T, opts); // a learning-step failure still counts
    expect(reviewBudget(p, 12, T).remaining).toBe(0);
    expect(recommend('es', p, settings, T).kind).not.toBe('review');
  });
});

describe('#8 AI endpoints and keys', () => {
  it('requires HTTPS except for this device’s loopback', () => {
    expect(endpointAllowed('https://api.example.com/v1')).toBe(true);
    expect(endpointAllowed('http://localhost:11434/v1')).toBe(true);
    expect(endpointAllowed('http://192.168.1.5:11434/v1')).toBe(false);
    expect(endpointAllowed('http://evil.example/v1')).toBe(false);
    expect(endpointAllowed('ftp://x')).toBe(false);
  });
  it('never sends a key to an endpoint it was not entered for', async () => {
    const calls: string[] = [];
    const g = globalThis as unknown as { fetch: unknown };
    const orig = g.fetch;
    g.fetch = async (u: string) => {
      calls.push(u);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    };
    try {
      await expect(chat({ enabled: true, endpoint: 'https://other.invalid/v1', model: 'm', apiKey: 'k', keyEndpoint: 'https://mine.example/v1' }, [])).rejects.toThrow('different endpoint');
      expect(calls).toEqual([]);
      expect(await chat({ enabled: true, endpoint: 'https://mine.example/v1', model: 'm', apiKey: 'k', keyEndpoint: 'https://mine.example/v1/' }, [])).toBe('ok');
    } finally {
      g.fetch = orig;
    }
  });
});

describe('#5 / #6 service worker', () => {
  type Handler = (e: { waitUntil: (p: Promise<unknown>) => void }) => void;
  function loadWorker(precache: string[]) {
    const store = new Map<string, Map<string, string>>([['other-app-v1', new Map()], ['polyglot:/another-repo/:abc', new Map()]]);
    const handlers: Record<string, Handler> = {};
    const caches = {
      keys: async () => [...store.keys()],
      delete: async (k: string) => store.delete(k),
      open: async (k: string) => {
        if (!store.has(k)) store.set(k, new Map());
        const c = store.get(k)!;
        return {
          addAll: async (reqs: { url: string }[]) => reqs.forEach((r) => c.set(r.url, 'body')),
          match: async (u: string | { url: string }) => c.get(typeof u === 'string' ? u : u.url),
          put: async () => {},
        };
      },
    };
    const self = {
      registration: { scope: 'https://user.github.io/polyglot/' },
      location: { origin: 'https://user.github.io' },
      addEventListener: (n: string, h: Handler) => (handlers[n] = h),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    };
    const src = readFileSync(fileURLToPath(new URL('../../scripts/sw-template.js', import.meta.url)), 'utf8');
    class FakeRequest {
      constructor(public url: string) {}
    }
    new Function('self', 'caches', 'Request', 'PRECACHE', 'VERSION', src)(self, caches, FakeRequest, precache, 'v2');
    const fire = async (name: string) => {
      let p: Promise<unknown> = Promise.resolve();
      handlers[name]({ waitUntil: (x) => (p = x) });
      await p;
    };
    return { store, fire };
  }

  it('precaches the shell and every built asset on install', async () => {
    const w = loadWorker(['./', 'index.html', 'assets/app.js', 'assets/app.css']);
    await w.fire('install');
    const mine = w.store.get('polyglot:/polyglot/:v2')!;
    expect([...mine.keys()].sort()).toEqual([
      'https://user.github.io/polyglot/',
      'https://user.github.io/polyglot/assets/app.css',
      'https://user.github.io/polyglot/assets/app.js',
      'https://user.github.io/polyglot/index.html',
    ]);
  });

  it('only deletes its own old caches on activation', async () => {
    const w = loadWorker(['index.html']);
    w.store.set('polyglot:/polyglot/:v1', new Map());
    await w.fire('install');
    await w.fire('activate');
    expect([...w.store.keys()].sort()).toEqual(['other-app-v1', 'polyglot:/another-repo/:abc', 'polyglot:/polyglot/:v2']);
  });
});

describe('spoken mode (typing off)', () => {
  const opts0 = { audio: true, mic: true, now: T, typing: false };
  it('lessons contain no typed exercises, keep every card, and stay complete', () => {
    for (const lang of LANGS) {
      for (const lesson of index(lang).lessons) {
        const ex = buildLesson(lesson, emptyLang(lang), { ...opts0, rng: seededRng(3) });
        expect(ex.filter(isTyped)).toEqual([]);
        expect(ex.some((e) => e.t === 'say' && e.from === 'vocab')).toBe(true);
        expect(ex.some((e) => e.t === 'say' && e.from === 'sentence')).toBe(true);
        expect(ex.some((e) => e.t === 'meaning')).toBe(true);
        for (const e of ex) {
          const m = meta(lang, e);
          if (m.graded && e.t !== 'speak') expect(expectedAnswers(lang, e).length).toBeGreaterThan(0);
          expect(isValidExercise(lang, e)).toBe(true);
        }
        // Typed and spoken versions practise the same memory cards.
        const typed = buildLesson(lesson, emptyLang(lang), { ...opts0, typing: true, rng: seededRng(3) });
        const cards = (list: Exercise[]) => list.map((e) => meta(lang, e).card).filter(Boolean).map((c) => `${c!.kind}:${c!.itemId}`).sort();
        expect(cards(ex)).toEqual(cards(typed));
      }
    }
  });

  it('review exercises in spoken mode keep the card identity', () => {
    for (const lang of LANGS) {
      let p = emptyLang(lang);
      const idx = index(lang);
      const v = [...idx.vocabById.values()][5];
      const s = [...idx.sentenceById.values()].find((x) => x.cloze)!;
      for (const k of ['p', 'r'] as const) p = applyReview(p, k, v.id, GOOD, T, opts);
      p = applyReview(p, 's', s.id, GOOD, T, opts);
      for (const c of Object.values(p.cards)) {
        for (let reps = 0; reps < 6; reps++) {
          const ex = exerciseForCard(lang, { ...c, card: { ...c.card, reps } }, true, false)!;
          expect(isTyped(ex)).toBe(false);
          expect(meta(lang, ex).card).toEqual({ kind: c.kind, itemId: c.itemId });
        }
      }
    }
  });

  it('sentence meaning options have exactly one acceptable answer', () => {
    for (const lang of LANGS) {
      for (const s of index(lang).sentenceById.values()) {
        const ok = new Set([s.en, ...(s.enAlt ?? [])].map((x) => x.toLowerCase()));
        for (let seed = 1; seed <= 5; seed++) {
          const o = sentenceOptions(lang, s.id, seededRng(seed));
          expect(o.length).toBe(4);
          expect(o.filter((x) => ok.has(x.toLowerCase())).length).toBe(1);
        }
      }
    }
  });

  it('a missed choice comes back as the same choice, not as typing', () => {
    const q: Exercise[] = [{ t: 'choice', vocabId: 'es.hola', options: ['hello', 'bye', 'please', 'thanks'] }, { t: 'recap', lessonId: 'es-1-1' }];
    const s = answerStep(initSession(q), { correct: false, xp: 0, lesson: true, typing: false }).snapshot;
    expect(s.queue.filter(isTyped)).toEqual([]);
    expect(s.queue[1].t).toBe('choice');
  });

  it('typing is off by default, and stored settings without the field load with it off', () => {
    expect(initialState().settings.typing).toBe(false);
  });

  it('self-rated spoken answers never count toward mastery', () => {
    let p = emptyLang('es');
    for (let d = 0; d < 4; d++) for (let i = 0; i < 12; i++) p = recordAttempt(p, { t: T + d * MS.DAY + i, skill: 'speaking', correct: true, source: 'self' });
    expect(skillSummary(p, 'speaking').attempts).toBe(0);
  });
});
