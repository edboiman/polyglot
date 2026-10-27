/**
 * Storage backends. The app talks to a tiny key/value interface so the
 * persistence logic (migrations, backups, import validation) can be tested
 * with an in-memory backend and run in the browser on IndexedDB, falling
 * back to localStorage where IndexedDB is unavailable (e.g. some private
 * browsing modes).
 */

export interface StorageBackend {
  readonly name: string;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export class MemoryBackend implements StorageBackend {
  readonly name = 'memory';
  private data = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.data.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T) {
    this.data.set(key, JSON.stringify(value));
  }
  async del(key: string) {
    this.data.delete(key);
  }
}

const DB_NAME = 'polyglot';
const STORE = 'kv';

export class IndexedDbBackend implements StorageBackend {
  readonly name = 'indexeddb';
  private dbp: Promise<IDBDatabase>;
  constructor(factory: IDBFactory = indexedDB) {
    this.dbp = new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.dbp;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result as T);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  get<T>(key: string) {
    return this.tx<T | undefined>('readonly', (s) => s.get(key));
  }
  async set<T>(key: string, value: T) {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async del(key: string) {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}

export class LocalStorageBackend implements StorageBackend {
  readonly name = 'localstorage';
  async get<T>(key: string) {
    const v = localStorage.getItem(`${DB_NAME}:${key}`);
    return v === null ? undefined : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T) {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value));
  }
  async del(key: string) {
    localStorage.removeItem(`${DB_NAME}:${key}`);
  }
}

/** Pick the best backend available in this browser. */
export async function detectBackend(): Promise<StorageBackend> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const b = new IndexedDbBackend();
      await b.set('__probe', 1);
      await b.del('__probe');
      return b;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('polyglot:__probe', '1');
      localStorage.removeItem('polyglot:__probe');
      return new LocalStorageBackend();
    }
  } catch {
    /* fall through */
  }
  return new MemoryBackend();
}
