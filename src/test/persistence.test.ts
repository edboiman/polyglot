import { describe, expect, it } from 'vitest';
import { GOOD } from '../engine/fsrs';
import { SCHEMA_VERSION, applyReview, initialState, schedulerOptions } from '../engine/model';
import { MemoryBackend } from '../storage/backend';
import {
  BEFORE_IMPORT_KEY, ImportError, PREMIGRATION_KEY, QUARANTINE_KEY, STATE_KEY,
  exportBackup, importBackup, loadState, migrate, parseBackup, saveState, startFresh, undoImport,
} from '../storage/persistence';

const T = new Date('2026-03-01T10:00:00').getTime();

function withProgress() {
  const s = initialState(T);
  s.langs.es = applyReview(s.langs.es, 'p', 'es.hola', GOOD, T, schedulerOptions(s.settings));
  s.langs.de = applyReview(s.langs.de, 'p', 'de.hallo', GOOD, T, schedulerOptions(s.settings));
  s.currentLang = 'de';
  return s;
}

const backupOf = (state: unknown) => JSON.stringify({ format: 'polyglot-backup', exportedAt: '', schemaVersion: SCHEMA_VERSION, state });

describe('loading and saving', () => {
  it('returns a fresh, writable state when nothing is stored', async () => {
    const r = await loadState(new MemoryBackend());
    expect(r.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.readOnly).toBe(false);
    expect(r.recovery).toBeUndefined();
  });

  it('saves and loads progress for each language separately', async () => {
    const b = new MemoryBackend();
    await saveState(b, withProgress());
    const { state } = await loadState(b);
    expect(state.currentLang).toBe('de');
    expect(Object.keys(state.langs.es.cards)).toEqual(['p:es.hola']);
    expect(Object.keys(state.langs.de.cards)).toEqual(['p:de.hallo']);
    expect(Object.keys(state.langs.fr.cards)).toEqual([]);
  });

  it('migrates v1 data, keeps a pre-migration copy and loses no progress', async () => {
    const b = new MemoryBackend();
    const v1 = {
      schemaVersion: 1,
      createdAt: T,
      currentLang: 'fr',
      settings: { dailyGoalMinutes: 10, newPerDay: 5 },
      langs: { fr: { cards: { 'p:fr.bonjour': { id: 'p:fr.bonjour', itemId: 'fr.bonjour', kind: 'p', card: { stability: 3, difficulty: 5, state: 'review', reps: 2, lapses: 0, lastReview: T, due: T }, introduced: T } } } },
    };
    await b.set(STATE_KEY, v1);
    const { state } = await loadState(b);
    expect(state.settings.dailyGoalXp).toBe(50);
    expect(state.settings.newPerDay).toBe(5);
    expect(state.langs.fr.cards['p:fr.bonjour'].card.stability).toBe(3);
    expect(await b.get(PREMIGRATION_KEY)).toEqual(v1);
  });

  it('repairs invalid settings with defaults', () => {
    const { state } = migrate({ schemaVersion: SCHEMA_VERSION, settings: { desiredRetention: 7, theme: 'neon' }, langs: {} });
    expect(state.settings.desiredRetention).toBe(0.9);
    expect(state.settings.theme).toBe('system');
  });

  it('treats data from a newer version as read-only and never overwrites it', async () => {
    const b = new MemoryBackend();
    const future = { schemaVersion: SCHEMA_VERSION + 5, futureField: 42, langs: { es: { cards: {} }, it: { cards: { x: 1 } } } };
    await b.set(STATE_KEY, future);
    const r = await loadState(b);
    expect(r.readOnly).toBe(true);
    const res = await saveState(b, r.state);
    expect(res.result).toBe('readonly');
    expect(await b.get(STATE_KEY)).toEqual(future);
  });

  it('keeps language entries it does not know about when saving', async () => {
    const b = new MemoryBackend();
    const { state } = migrate({ schemaVersion: SCHEMA_VERSION, langs: { es: {}, it: { cards: {} } } });
    await saveState(b, state);
    expect(((await b.get<{ langs: Record<string, unknown> }>(STATE_KEY))!.langs).it).toEqual({ cards: {} });
  });

  it('refuses to overwrite progress saved by another tab', async () => {
    const b = new MemoryBackend();
    const a = withProgress();
    const first = await saveState(b, a);
    expect(first.result).toBe('saved');
    // Tab 2 loads and saves twice.
    const tab2 = (await loadState(b)).state;
    await saveState(b, tab2);
    // Tab 1 still has the old revision.
    const stale = await saveState(b, { ...a, revision: first.revision });
    expect(stale.result).toBe('conflict');
  });
});

describe('recovery', () => {
  it('quarantines malformed stored data and does not write over it', async () => {
    const b = new MemoryBackend();
    const bad = { schemaVersion: SCHEMA_VERSION, langs: { es: { cards: null } } };
    await b.set(STATE_KEY, bad);
    const r = await loadState(b);
    expect(r.recovery).toBeDefined();
    expect(r.readOnly).toBe(true);
    expect(await b.get(STATE_KEY)).toEqual(bad);
    expect((await b.get<{ data: unknown }>(QUARANTINE_KEY))!.data).toEqual(bad);
  });

  it('treats a failed storage read as recovery, not as an empty profile', async () => {
    const b = new MemoryBackend();
    b.get = async () => {
      throw new Error('read failed');
    };
    const r = await loadState(b);
    expect(r.recovery).toBeDefined();
    expect(r.readOnly).toBe(true);
  });

  it('starting fresh keeps the damaged data in quarantine', async () => {
    const b = new MemoryBackend();
    await b.set(STATE_KEY, 'garbage');
    await startFresh(b);
    expect((await b.get<{ data: unknown }>(QUARANTINE_KEY))!.data).toBe('garbage');
    expect((await loadState(b)).recovery).toBeUndefined();
  });
});

describe('backup export / import', () => {
  it('round-trips progress', () => {
    const back = parseBackup(JSON.stringify(exportBackup(withProgress()))).state;
    expect(back.langs.es.cards['p:es.hola'].card.reps).toBe(1);
    expect(back.currentLang).toBe('de');
  });

  it('never exports AI settings or keys', () => {
    const s = withProgress();
    s.settings.ai = { enabled: true, endpoint: 'https://a.example/v1', model: 'm', apiKey: 'secret', keyEndpoint: 'https://a.example/v1' };
    const out = JSON.stringify(exportBackup(s));
    expect(out).not.toContain('secret');
    expect(out).not.toContain('a.example');
  });

  const malformed: [string, unknown][] = [
    ['null cards', { langs: { es: { cards: null } } }],
    ['null attempts', { langs: { es: { cards: {}, attempts: null } } }],
    ['invalid grade', { langs: { es: { reviewLog: [{ t: T, cardId: 'p:es.hola', grade: 9, due: true }] } } }],
    ['invalid date', { langs: { es: { cards: { 'p:es.hola': { id: 'p:es.hola', itemId: 'es.hola', kind: 'p', introduced: T, card: { stability: 1, difficulty: 5, state: 'review', reps: 1, lapses: 0, lastReview: 'yesterday', due: T } } } } } }],
    ['invalid card state', { langs: { es: { cards: { 'p:es.hola': { id: 'p:es.hola', itemId: 'es.hola', kind: 'p', introduced: T, card: { stability: 1, difficulty: 5, state: 'weird', reps: 1, lapses: 0, lastReview: T, due: T } } } } } }],
    ['non-object resume', { langs: { es: { resume: 'step 3' } } }],
    ['skill not known', { langs: { es: { attempts: [{ t: T, skill: 'magic', correct: true }] } } }],
    ['no progress section', { settings: {} }],
  ];
  for (const [name, state] of malformed) {
    it(`rejects a backup with ${name} and leaves current progress intact`, async () => {
      const b = new MemoryBackend();
      const current = withProgress();
      await saveState(b, current);
      const before = await b.get(STATE_KEY);
      await expect(importBackup(b, current, backupOf({ schemaVersion: SCHEMA_VERSION, ...(state as object) }))).rejects.toBeInstanceOf(ImportError);
      expect(await b.get(STATE_KEY)).toEqual(before);
    });
  }

  it('rejects oversized files and non-backups', () => {
    expect(() => parseBackup('x'.repeat(11 * 1024 * 1024))).toThrow('too large');
    expect(() => parseBackup('not json')).toThrow(ImportError);
    expect(() => parseBackup('{"hello":1}')).toThrow('not a Polyglot backup');
  });

  it('drops cards for content that no longer exists instead of failing', () => {
    const s = withProgress();
    const stale = { ...s.langs.es.cards['p:es.hola'], id: 'p:es.gone', itemId: 'es.gone' };
    s.langs.es.cards['p:es.gone'] = stale;
    const r = parseBackup(JSON.stringify(exportBackup(s)));
    expect(r.dropped).toBe(1);
    expect(r.state.langs.es.cards['p:es.gone']).toBeUndefined();
    expect(r.state.langs.es.cards['p:es.hola']).toBeDefined();
  });

  it('keeps this device’s AI settings: an imported endpoint can never receive the existing key', async () => {
    const b = new MemoryBackend();
    const current = initialState(T);
    current.settings.ai = { enabled: true, endpoint: 'https://mine.example/v1', model: 'm', apiKey: 'demo-key', keyEndpoint: 'https://mine.example/v1' };
    await saveState(b, current);
    const evil = { ...withProgress(), settings: { ...withProgress().settings, ai: { enabled: true, endpoint: 'https://other.invalid/v1', model: 'x', apiKey: '', keyEndpoint: '' } } };
    const { state } = await importBackup(b, { ...current, revision: 1 }, backupOf(evil));
    expect(state.settings.ai.endpoint).toBe('https://mine.example/v1');
    expect(state.settings.ai.apiKey).toBe('demo-key');
  });

  it('keeps the replaced data and can undo the import', async () => {
    const b = new MemoryBackend();
    const current = initialState(T);
    const s1 = await saveState(b, current);
    const { state } = await importBackup(b, { ...current, revision: s1.revision }, JSON.stringify(exportBackup(withProgress())));
    expect(state.langs.es.cards['p:es.hola']).toBeDefined();
    expect(await b.get(BEFORE_IMPORT_KEY)).toBeDefined();
    const undone = await undoImport(b, state);
    expect(undone!.langs.es.cards).toEqual({});
  });
});
