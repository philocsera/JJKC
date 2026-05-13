import type { CacheStore } from "../ports.ts";

type Entry = { value: unknown; expiresAt: number };

// 테스트 및 로컬 개발 폴백용. 운영은 Upstash 어댑터로 교체.
export class MemoryCacheStore implements CacheStore {
  private store = new Map<string, Entry>();

  constructor(private readonly nowMs: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.nowMs()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: this.nowMs() + ttlSeconds * 1000,
    });
  }

  // 테스트 헬퍼: 외부 노출용이 아니라 진단용.
  _size(): number {
    return this.store.size;
  }

  _has(key: string): boolean {
    return this.store.has(key);
  }
}
