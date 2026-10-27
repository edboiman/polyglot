/**
 * Loading, saving, migrating, exporting and importing the learner's data.
 *
 * Safety rules:
 *  - Data carries a `schemaVersion`. Older data is migrated step by step; a
 *    copy of the pre-migration data is kept under `state.premigration`.
 *  - Stored data is validated. If it is unreadable or malformed, it is
 *    copied to a quarantine key and the app enters recovery mode, where
 *    nothing is written until the learner chooses what to do.
 *  - Data saved by a *newer* app version is loaded read-only: this version
 *    never overwrites it.
 *  - Saves use a revision number, so a stale tab cannot overwrite progress
 *    saved by another tab.
 *  - Imports are validated in full before anything is written; the replaced
 *    data is kept under `state.beforeimport` and can be restored. AI
 *    settings and keys are never imported.
 */

import { type AppState, SCHEMA_VERSION, initialState } from '../engine/model';
import type { StorageBackend } from './backend';
import { MAX_BACKUP_BYTES, ValidationError, checkState } from './schema';

export const STATE_KEY = 'state';
export const PREMIGRATION_KEY = `${STATE_KEY}.premigration`;
export const BEFORE_IMPORT_KEY = `${STATE_KEY}.beforeimport`;
export const QUARANTINE_KEY = `${STATE_KEY}.quarantine`;

type Json = Record<string, unknown>;

/** Migrations from version N to N+1. */
const MIGRATIONS: Record<number, (s: Json) => Json> = {
  // v1 stored a daily goal in minutes and had no badges map.
  1: (s) => {
    const settings = { ...((s.settings as Json) ?? {}) };
    if (typeof settings.dailyGoalMinutes === 'number') {
      settings.dailyGoalXp = Math.max(20, Math.round((settings.dailyGoalMinutes as number) * 5));
      delete settings.dailyGoalMinutes;
    }
    return { ...s, settings, badges: (s.badges as Json) ?? {}, schemaVersion: 2 };
  },
};

export interface Loaded {
  state: AppState;
  /** Data from a newer app version: show it, but never save over it. */
  readOnly: boolean;
  /** Set when stored data could not be used; the raw data was quarantined. */
  recovery?: { reason: string };
  /** Cards dropped because their content no longer exists. */
  dropped: number;
}

function isObj(v: unknown): v is Json {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Migrate and validate raw stored data. Throws ValidationError if it is malformed. */
export function migrate(raw: Json): { state: AppState; migrated: boolean; readOnly: boolean; dropped: number } {
  let s = raw;
  let v = Number(s.schemaVersion) || 1;
  const readOnly = v > SCHEMA_VERSION;
  let migrated = false;
  while (v < SCHEMA_VERSION && MIGRATIONS[v]) {
    s = MIGRATIONS[v](s);
    v = Number(s.schemaVersion) || v + 1;
    migrated = true;
  }
  const check = checkState(s, Math.max(SCHEMA_VERSION, v));
  if (check.problems.length) throw new ValidationError(check.problems);
  return { state: check.state, migrated, readOnly, dropped: check.dropped };
}

export async function loadState(backend: StorageBackend): Promise<Loaded> {
  let raw: unknown;
  try {
    raw = await backend.get<unknown>(STATE_KEY);
  } catch {
    // A failed read is not the same as no data: do not start writing.
    return { state: initialState(), readOnly: true, recovery: { reason: 'Saved progress could not be read from this device’s storage.' }, dropped: 0 };
  }
  if (raw === undefined || raw === null) return { state: initialState(), readOnly: false, dropped: 0 };
  if (!isObj(raw)) return quarantine(backend, raw, 'Saved progress is not in a recognisable format.');
  try {
    const m = migrate(raw);
    if (m.migrated && !m.readOnly) {
      await backend.set(PREMIGRATION_KEY, raw);
      await backend.set(STATE_KEY, { ...m.state, revision: (m.state.revision ?? 0) + 1 });
      m.state.revision = (m.state.revision ?? 0) + 1;
    }
    return { state: m.state, readOnly: m.readOnly, dropped: m.dropped };
  } catch (e) {
    return quarantine(backend, raw, e instanceof ValidationError ? `Saved progress is damaged: ${e.problems[0]}` : 'Saved progress could not be loaded.');
  }
}

async function quarantine(backend: StorageBackend, raw: unknown, reason: string): Promise<Loaded> {
  try {
    await backend.set(QUARANTINE_KEY, { at: Date.now(), reason, data: raw });
  } catch {
    /* the original is still under STATE_KEY because nothing is written in recovery mode */
  }
  return { state: initialState(), readOnly: true, recovery: { reason }, dropped: 0 };
}

export type SaveResult = 'saved' | 'conflict' | 'readonly';

/**
 * Save if nobody else has saved since we loaded (`state.revision`).
 * Returns the saved state's new revision via the callback.
 */
export async function saveState(backend: StorageBackend, state: AppState): Promise<{ result: SaveResult; revision: number }> {
  const stored = await backend.get<Json>(STATE_KEY);
  const storedRev = isObj(stored) && typeof stored.revision === 'number' ? stored.revision : 0;
  const ours = state.revision ?? 0;
  if (isObj(stored) && Number(stored.schemaVersion) > SCHEMA_VERSION) return { result: 'readonly', revision: storedRev };
  if (storedRev > ours) return { result: 'conflict', revision: storedRev };
  const revision = ours + 1;
  const { extraLangs, ...rest } = state as AppState & { extraLangs?: Json };
  const toWrite = { ...rest, langs: { ...(extraLangs ?? {}), ...state.langs }, revision };
  await backend.set(STATE_KEY, toWrite);
  return { result: 'saved', revision };
}

/** Start over after a recovery: the damaged data stays in quarantine. */
export async function startFresh(backend: StorageBackend): Promise<AppState> {
  const raw = await backend.get<unknown>(STATE_KEY).catch(() => undefined);
  if (raw !== undefined) {
    const q = await backend.get<unknown>(QUARANTINE_KEY).catch(() => undefined);
    if (!q) await backend.set(QUARANTINE_KEY, { at: Date.now(), reason: 'kept when starting fresh', data: raw });
  }
  const s = { ...initialState(), revision: 1 };
  await backend.set(STATE_KEY, s);
  return s;
}

/* ------------------------------------------------------------ backups */

export const BACKUP_FORMAT = 'polyglot-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  schemaVersion: number;
  state: AppState;
}

/** Export progress. AI settings and keys are never included. */
export function exportBackup(state: AppState): BackupFile {
  const copy: AppState = JSON.parse(JSON.stringify(state));
  copy.settings.ai = { enabled: false, endpoint: '', model: '', apiKey: '', keyEndpoint: '' };
  delete copy.revision;
  return { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), schemaVersion: state.schemaVersion, state: copy };
}

export class ImportError extends Error {}

export interface ParsedBackup {
  state: AppState;
  dropped: number;
}

/** Validate and migrate a backup file's contents. Throws ImportError and writes nothing. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new ImportError('This file is too large to be a Polyglot backup.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('This file is not valid JSON.');
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT || !isObj(data.state)) throw new ImportError('This file is not a Polyglot backup.');
  if (Number(data.state.schemaVersion) > SCHEMA_VERSION) throw new ImportError('This backup was made by a newer version of Polyglot. Update the app first.');
  try {
    const m = migrate(data.state);
    return { state: m.state, dropped: m.dropped };
  } catch (e) {
    throw new ImportError(e instanceof ValidationError ? `The backup is damaged and was not imported: ${e.problems[0]}` : 'The backup could not be read.');
  }
}

/**
 * Replace progress with a validated backup. AI settings (including any
 * key) always stay as configured on this device — a backup can never point
 * an existing key at a different endpoint.
 */
export async function importBackup(backend: StorageBackend, current: AppState, text: string): Promise<{ state: AppState; dropped: number }> {
  const { state: incoming, dropped } = parseBackup(text);
  const next: AppState = { ...incoming, settings: { ...incoming.settings, ai: current.settings.ai }, revision: current.revision ?? 0 };
  await backend.set(BEFORE_IMPORT_KEY, current);
  const r = await saveState(backend, next);
  if (r.result !== 'saved') throw new ImportError('Progress changed in another tab. Reload and try again.');
  return { state: { ...next, revision: r.revision }, dropped };
}

/** Restore the data that was replaced by the last import. */
export async function undoImport(backend: StorageBackend, current: AppState): Promise<AppState | null> {
  const prev = await backend.get<Json>(BEFORE_IMPORT_KEY);
  if (!isObj(prev)) return null;
  const m = migrate(prev);
  const next = { ...m.state, revision: current.revision ?? 0 };
  const r = await saveState(backend, next);
  if (r.result !== 'saved') return null;
  await backend.del(BEFORE_IMPORT_KEY);
  return { ...next, revision: r.revision };
}

export async function hasUndoImport(backend: StorageBackend): Promise<boolean> {
  return isObj(await backend.get(BEFORE_IMPORT_KEY).catch(() => undefined));
}

/** Raw stored data for a "download what is stored" recovery action. */
export async function rawExport(backend: StorageBackend): Promise<string> {
  const [state, quarantine, before] = await Promise.all([
    backend.get(STATE_KEY).catch(() => null),
    backend.get(QUARANTINE_KEY).catch(() => null),
    backend.get(BEFORE_IMPORT_KEY).catch(() => null),
  ]);
  return JSON.stringify({ exportedAt: new Date().toISOString(), state, quarantine, beforeImport: before }, null, 1);
}
