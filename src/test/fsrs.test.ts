import { describe, expect, it } from 'vitest';
import {
  AGAIN, DEFAULT_OPTIONS, EASY, GOOD, HARD, MS, currentRetrievability, intervalForStability,
  isDue, maturity, newCard, retrievability, review,
} from '../engine/fsrs';

const T0 = new Date('2026-01-01T09:00:00').getTime();

describe('FSRS memory model', () => {
  it('recall probability is 90% when elapsed time equals stability', () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
    expect(retrievability(0, 10)).toBe(1);
  });

  it('recall probability decreases over time', () => {
    expect(retrievability(5, 3)).toBeLessThan(retrievability(1, 3));
  });

  it('interval equals stability at 90% desired retention', () => {
    expect(intervalForStability(10)).toBeCloseTo(10, 5);
    expect(intervalForStability(10, { ...DEFAULT_OPTIONS, desiredRetention: 0.8 })).toBeGreaterThan(10);
    expect(intervalForStability(10, { ...DEFAULT_OPTIONS, desiredRetention: 0.95 })).toBeLessThan(10);
  });

  it('first rating sets initial stability from the weights', () => {
    const c = newCard(T0);
    const again = review(c, AGAIN, T0);
    const good = review(c, GOOD, T0);
    const easy = review(c, EASY, T0);
    expect(again.stability).toBeLessThan(good.stability);
    expect(good.stability).toBeLessThan(easy.stability);
    expect(again.difficulty).toBeGreaterThan(easy.difficulty);
  });

  it('failed new cards come back within the same session', () => {
    const c = review(newCard(T0), AGAIN, T0);
    expect(c.state).toBe('learning');
    expect(c.due - T0).toBeLessThanOrEqual(10 * MS.MIN);
  });

  it('successful reviews grow intervals; well-known material is repeated less', () => {
    let c = review(newCard(T0), GOOD, T0);
    const intervals: number[] = [];
    let t = T0;
    for (let i = 0; i < 5; i++) {
      intervals.push((c.due - t) / MS.DAY);
      t = c.due;
      c = review(c, GOOD, t);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(maturity(c)).toBe('mature');
  });

  it('difficult items come back sooner than easy ones', () => {
    const base = review(newCard(T0), GOOD, T0);
    const t = base.due;
    const hard = review(base, HARD, t);
    const good = review(base, GOOD, t);
    const easy = review(base, EASY, t);
    expect(hard.due).toBeLessThan(good.due);
    expect(good.due).toBeLessThan(easy.due);
  });

  it('a lapse reduces stability and counts a lapse', () => {
    let c = review(newCard(T0), GOOD, T0);
    c = review(c, GOOD, c.due);
    const before = c.stability;
    const lapsed = review(c, AGAIN, c.due);
    expect(lapsed.stability).toBeLessThan(before);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe('relearning');
  });

  it('is not due before its due date and is due after it', () => {
    const c = review(newCard(T0), GOOD, T0);
    expect(isDue(c, T0 + MS.MIN)).toBe(false);
    expect(isDue(c, c.due)).toBe(true);
    expect(isDue(newCard(T0), T0)).toBe(false); // new cards are introduced by lessons, not "due"
  });

  it('current retrievability is reported for studied cards only', () => {
    expect(currentRetrievability(newCard(T0), T0)).toBe(0);
    const c = review(newCard(T0), GOOD, T0);
    expect(currentRetrievability(c, T0 + MS.DAY)).toBeGreaterThan(0.5);
  });

  it('respects the maximum interval', () => {
    let c = review(newCard(T0), EASY, T0);
    for (let i = 0; i < 12; i++) c = review(c, EASY, c.due);
    expect((c.due - c.lastReview) / MS.DAY).toBeLessThanOrEqual(DEFAULT_OPTIONS.maximumInterval);
  });
});
