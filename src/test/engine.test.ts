import { describe, expect, it } from 'vitest';
import { index } from '../data/courses';
import { dueCards, forecast, retention, skillSummary, streak, weaknesses } from '../engine/analytics';
import { AGAIN, GOOD, MS } from '../engine/fsrs';
import {
  addXp, applyReview, completeLesson, emptyLang, initialState, recordAttempt, recordErrorExample, schedulerOptions,
} from '../engine/model';
import { recommend } from '../engine/recommend';
import {
  buildLesson, buildReview, choiceOptions, expectedAnswers, interleaveCandidates, lessonUnlocked, meta, seededRng,
} from '../engine/session';

const T = new Date('2026-05-04T09:00:00').getTime();
const opts = schedulerOptions(initialState().settings);

describe('lesson builder', () => {
  const l1 = index('es').lessonById.get('es-1-1')!;

  it('builds intro → content → final check → recap', () => {
    const ex = buildLesson(l1, emptyLang('es'), { audio: true, mic: true, rng: seededRng(1), now: T });
    expect(ex[0].t).toBe('intro');
    expect(ex[1].t).toBe('dialogue');
    expect(ex[ex.length - 1].t).toBe('recap');
    expect(ex.filter((e) => e.t === 'present').length).toBe(l1.vocab.length);
    expect(ex.some((e) => 'final' in e && e.final)).toBe(true);
    expect(ex.some((e) => e.t === 'speak')).toBe(true);
  });

  it('prioritises recall over multiple choice', () => {
    const ex = buildLesson(l1, emptyLang('es'), { audio: true, mic: false, rng: seededRng(2), now: T });
    const choice = ex.filter((e) => e.t === 'choice').length;
    const recall = ex.filter((e) => ['recall', 'cloze', 'translate', 'listen', 'listenWord'].includes(e.t)).length;
    expect(recall).toBeGreaterThan(choice);
  });

  it('works without audio or microphone', () => {
    const ex = buildLesson(l1, emptyLang('es'), { audio: false, mic: false, rng: seededRng(3), now: T });
    expect(ex.some((e) => e.t === 'speak' || e.t === 'listen' || e.t === 'listenWord')).toBe(false);
    expect(ex.some((e) => e.t === 'choice' && e.audio)).toBe(false);
  });

  it('only interleaves material from earlier lessons that was actually studied', () => {
    let p = emptyLang('es');
    const later = index('es').lessonById.get('es-2-1')!;
    // nothing studied: no review items
    expect(buildLesson(later, p, { audio: false, mic: false, rng: seededRng(4), now: T }).some((e) => 'review' in e && e.review)).toBe(false);
    p = applyReview(p, 'p', 'es.gracias', GOOD, T - MS.DAY, opts);
    p = applyReview(p, 'p', 'es.madre', GOOD, T - MS.DAY, opts); // from the same lesson: must not be interleaved
    const cands = interleaveCandidates('es', later, p, T).map((c) => c.itemId);
    expect(cands).toEqual(['es.gracias']);
  });

  it('every graded exercise has expected answers and a skill', () => {
    for (const lang of ['es', 'de', 'fr'] as const) {
      for (const lesson of index(lang).lessons) {
        const ex = buildLesson(lesson, emptyLang(lang), { audio: true, mic: true, rng: seededRng(5), now: T });
        for (const e of ex) {
          const m = meta(lang, e);
          if (!m.graded) continue;
          expect(m.skill).toBeDefined();
          if (e.t !== 'choice') expect(expectedAnswers(lang, e).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('choice options contain the answer and distinct distractors', () => {
    const v = index('de').vocabById.get('de.vater')!;
    const o = choiceOptions('de', v, seededRng(9));
    expect(o).toContain('father');
    expect(new Set(o).size).toBe(o.length);
    expect(o.length).toBe(4);
  });

  it('noun production expects the article', () => {
    expect(expectedAnswers('de', { t: 'recall', dir: 'en2tl', vocabId: 'de.vater', hints: false })[0]).toBe('der Vater');
    expect(expectedAnswers('fr', { t: 'recall', dir: 'en2tl', vocabId: 'fr.eau', hints: false })[0]).toBe("l'eau");
    expect(expectedAnswers('es', { t: 'recall', dir: 'en2tl', vocabId: 'es.agua', hints: false })[0]).toBe('el agua');
  });
});

describe('unlocking', () => {
  it('unlocks lessons in order unless free navigation is on', () => {
    let p = emptyLang('fr');
    expect(lessonUnlocked('fr', 'fr-1-1', p, false)).toBe(true);
    expect(lessonUnlocked('fr', 'fr-1-2', p, false)).toBe(false);
    expect(lessonUnlocked('fr', 'fr-1-2', p, true)).toBe(true);
    p = completeLesson(p, 'fr-1-1', 0.9, T);
    expect(lessonUnlocked('fr', 'fr-1-2', p, false)).toBe(true);
  });
});

describe('smart review', () => {
  it('shows nothing as due for a new learner', () => {
    const p = emptyLang('es');
    expect(buildReview('es', p, { mode: 'due', limit: 50, audio: false, rng: seededRng(1), now: T })).toEqual([]);
  });

  it('includes only cards whose due date has passed', () => {
    let p = emptyLang('es');
    p = applyReview(p, 'p', 'es.hola', GOOD, T, opts); // due tomorrow+
    p = applyReview(p, 'p', 'es.adios', AGAIN, T, opts); // due in minutes
    expect(dueCards(p, T + MS.MIN).length).toBe(0);
    expect(dueCards(p, T + 6 * MS.MIN).map((c) => c.itemId)).toEqual(['es.adios']);
    const ex = buildReview('es', p, { mode: 'due', limit: 50, audio: false, rng: seededRng(1), now: T + 30 * 60_000 });
    expect(ex.length).toBe(1);
  });

  it('keeps languages independent', () => {
    const s = initialState(T);
    s.langs.de = applyReview(s.langs.de, 'p', 'de.hallo', AGAIN, T, opts);
    expect(dueCards(s.langs.es, T + MS.DAY).length).toBe(0);
    expect(dueCards(s.langs.de, T + MS.DAY).length).toBe(1);
  });

  it('forecasts upcoming workload', () => {
    let p = emptyLang('es');
    p = applyReview(p, 'p', 'es.hola', GOOD, T, opts);
    const f = forecast(p, T, 7);
    expect(f.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('mastery and analytics', () => {
  it('does not call a skill mastered after a handful of answers', () => {
    let p = emptyLang('es');
    for (let i = 0; i < 10; i++) p = recordAttempt(p, { t: T + i, skill: 'vocabProduction', correct: true });
    expect(skillSummary(p, 'vocabProduction').level).toBe('developing');
  });

  it('requires sustained accuracy across several days for mastery', () => {
    let p = emptyLang('es');
    for (let d = 0; d < 4; d++)
      for (let i = 0; i < 12; i++) p = recordAttempt(p, { t: T + d * MS.DAY + i, skill: 'grammar', correct: true });
    expect(skillSummary(p, 'grammar').level).toBe('mastered');
  });

  it('ignores self-assessed speaking for mastery', () => {
    let p = emptyLang('es');
    for (let d = 0; d < 5; d++)
      for (let i = 0; i < 12; i++) p = recordAttempt(p, { t: T + d * MS.DAY + i, skill: 'speaking', correct: true, source: 'self' });
    expect(skillSummary(p, 'speaking').level).toBe('not-started');
  });

  it('separates estimated retention from observed accuracy', () => {
    let p = emptyLang('es');
    p = applyReview(p, 'p', 'es.hola', GOOD, T, opts);
    const r = retention(p, T + MS.DAY);
    expect(r.estimated).not.toBeNull();
    expect(r.observed).toBeNull(); // no scheduled reviews done yet
  });

  it('detects a recurring grammar weakness and recommends the workshop', () => {
    let p = emptyLang('de');
    p = completeLesson(p, 'de-6-1', 1, T - MS.DAY);
    for (let i = 0; i < 4; i++) p = recordAttempt(p, { t: T + i, skill: 'grammar', correct: false, concepts: ['de.dative'] });
    p = recordErrorExample(p, 'de.dative', { got: 'mit der Bus', want: 'mit dem Bus' });
    expect(weaknesses(p, T + 10)[0]).toMatchObject({ concept: 'de.dative', errors: 4 });
    const rec = recommend('de', p, initialState().settings, T + 10);
    expect(rec).toMatchObject({ kind: 'grammar', topicId: 'de.gr.cases' });
  });

  it('clears a weakness after repeated correct answers', () => {
    let p = emptyLang('de');
    for (let i = 0; i < 4; i++) p = recordAttempt(p, { t: T + i, skill: 'grammar', correct: false, concepts: ['de.dative'] });
    for (let i = 0; i < 5; i++) p = recordAttempt(p, { t: T + 100 + i, skill: 'grammar', correct: true, concepts: ['de.dative'] });
    expect(weaknesses(p, T + 200)).toEqual([]);
  });

  it('recommends review first when many items are due', () => {
    let p = emptyLang('es');
    for (const id of index('es').lessonById.get('es-1-1')!.vocab.map((v) => v.id).concat(index('es').lessonById.get('es-1-2')!.vocab.map((v) => v.id))) {
      p = applyReview(p, 'p', id, GOOD, T - 30 * MS.DAY, opts);
    }
    expect(recommend('es', p, initialState().settings, T).kind).toBe('review');
  });

  it('recommends the first lesson to a new learner', () => {
    expect(recommend('fr', emptyLang('fr'), initialState().settings, T)).toMatchObject({ kind: 'lesson', lessonId: 'fr-1-1' });
  });

  it('counts a streak with one forgiven rest day per week', () => {
    const s = initialState(T);
    for (const d of [0, 1, 3, 4]) s.langs.es = addXp(s.langs.es, 10, T - d * MS.DAY);
    expect(streak(s, T).days).toBe(4);
    const s2 = initialState(T);
    for (const d of [0, 2, 4]) s2.langs.es = addXp(s2.langs.es, 10, T - d * MS.DAY);
    expect(streak(s2, T).days).toBe(2); // second gap within a week breaks it
  });
});
