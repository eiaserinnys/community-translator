import type { components } from "@community-translator/contracts";

type TranslationTarget = components["schemas"]["TranslationTarget"];
type TranslationTone = components["schemas"]["TranslationTone"];

const DAY_MS = 86_400_000;

// Bump when the stored value stops meaning what it used to, so old rows miss
// instead of being served as if they were current.
const CACHE_VERSION = "codex-ko-en-v1";

export interface TranslationCacheRequest {
  readonly target: TranslationTarget;
  readonly text: string;
  readonly tone?: TranslationTone | undefined;
}

export interface TranslationCacheStats {
  readonly bytes: number;
  readonly count: number;
}

export interface TranslationCache {
  clear(): Promise<void>;
  get(key: string, days: number): Promise<string | null>;
  put(key: string, text: string, days: number): Promise<void>;
  stats(): Promise<TranslationCacheStats>;
}

/**
 * The key is a hash, so the store holds no message text, no page address and no
 * account name — only an opaque key and the translation it produced.
 */
export async function translationCacheKey(request: TranslationCacheRequest): Promise<string> {
  const payload = JSON.stringify([
    CACHE_VERSION,
    request.target,
    request.tone ?? "",
    request.text,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface CacheRecord {
  bytes: number;
  created: number;
  key: string;
  text: string;
}

export interface IndexedDbTranslationCacheOptions {
  readonly clock?: () => number;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  readonly name?: string;
}

export class IndexedDbTranslationCache implements TranslationCache {
  private readonly clock: () => number;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly name: string;
  private database: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbTranslationCacheOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    this.maxEntries = options.maxEntries ?? 2_000;
    this.name = options.name ?? "community-translator";
  }

  async get(key: string, days: number): Promise<string | null> {
    if (days <= 0) return null;
    const record = await this.run<CacheRecord | undefined>("readonly", (store) => store.get(key));
    if (!record) return null;
    if (this.clock() - record.created >= days * DAY_MS) {
      await this.run("readwrite", (store) => store.delete(key));
      return null;
    }
    return record.text;
  }

  async put(key: string, text: string, days: number): Promise<void> {
    if (days <= 0) return;
    const record: CacheRecord = {
      // The row overhead is approximated so the byte budget stays meaningful
      // without reading the store's real on-disk size.
      bytes: new TextEncoder().encode(text).length + 160,
      created: this.clock(),
      key,
      text,
    };
    await this.run("readwrite", (store) => store.put(record));
    await this.prune(days);
  }

  async prune(days: number): Promise<void> {
    const records = await this.run<CacheRecord[]>("readonly", (store) =>
      store.index("created").getAll(),
    );
    let count = records.length;
    let bytes = records.reduce((sum, record) => sum + record.bytes, 0);
    const doomed: string[] = [];

    // records arrive oldest first, so the budget is met by dropping the oldest.
    for (const record of records) {
      const expired = days <= 0 || this.clock() - record.created >= days * DAY_MS;
      if (expired || count > this.maxEntries || bytes > this.maxBytes) {
        doomed.push(record.key);
        count -= 1;
        bytes -= record.bytes;
      }
    }

    if (doomed.length > 0) {
      await this.run("readwrite", (store) => {
        for (const key of doomed) store.delete(key);
      });
    }
  }

  async stats(): Promise<TranslationCacheStats> {
    const records = await this.run<CacheRecord[]>("readonly", (store) => store.getAll());
    return {
      bytes: records.reduce((sum, record) => sum + record.bytes, 0),
      count: records.length,
    };
  }

  async clear(): Promise<void> {
    await this.run("readwrite", (store) => store.clear());
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("translations", { keyPath: "key" });
        store.createIndex("created", "created");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("translations", mode);
      const request = action(transaction.objectStore("translations"));
      transaction.oncomplete = () => resolve(request?.result as T);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}
