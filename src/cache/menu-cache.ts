import type { MenuQuery, SchoolCoverage } from '../types/dining.js';
import type { ProviderFetchResult } from '../providers/types.js';

export type MenuResponsePayload = {
  school: SchoolCoverage;
  query: MenuQuery;
  result: ProviderFetchResult;
};

export type MenuCacheStatus = 'HIT' | 'MISS' | 'INFLIGHT';

type CacheEntry = {
  payload: MenuResponsePayload;
  storedAt: number;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const PROVIDER_ERROR_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

const menuCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MenuResponsePayload>>();

export function createMenuCacheKey(school: SchoolCoverage, query: MenuQuery) {
  return [
    school.id,
    school.providerKind,
    query.date ?? '',
    query.meal ?? '',
    query.locationId ?? '',
  ].join('|');
}

export async function getCachedMenuPayload(
  key: string,
  fetcher: () => Promise<MenuResponsePayload>
): Promise<{ payload: MenuResponsePayload; cacheStatus: MenuCacheStatus; ageSeconds: number }> {
  const now = Date.now();
  const cached = menuCache.get(key);

  if (cached && cached.expiresAt > now) {
    return {
      payload: cached.payload,
      cacheStatus: 'HIT',
      ageSeconds: Math.max(0, Math.floor((now - cached.storedAt) / 1000)),
    };
  }

  const pending = inflight.get(key);
  if (pending) {
    const payload = await pending;
    const entry = menuCache.get(key);
    return {
      payload,
      cacheStatus: 'INFLIGHT',
      ageSeconds: entry ? Math.max(0, Math.floor((Date.now() - entry.storedAt) / 1000)) : 0,
    };
  }

  const promise = fetcher();
  inflight.set(key, promise);

  try {
    const payload = await promise;
    const ttl = payload.result.state === 'provider_error' ? PROVIDER_ERROR_TTL_MS : DEFAULT_TTL_MS;
    setCacheEntry(key, payload, ttl);
    return { payload, cacheStatus: 'MISS', ageSeconds: 0 };
  } finally {
    inflight.delete(key);
  }
}

function setCacheEntry(key: string, payload: MenuResponsePayload, ttlMs: number) {
  if (menuCache.size >= MAX_ENTRIES) {
    const oldestKey = menuCache.keys().next().value;
    if (oldestKey) menuCache.delete(oldestKey);
  }

  const now = Date.now();
  menuCache.set(key, {
    payload,
    storedAt: now,
    expiresAt: now + ttlMs,
  });
}

