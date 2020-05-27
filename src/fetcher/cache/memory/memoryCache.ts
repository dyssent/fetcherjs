import { Tag, TagMatch } from '../tag';
import { Cache, CacheChangeHandler, CacheChange } from '../cache';
import { MemoryCacheConfig, MemoryCacheRecord, defaultMemoryCacheConfig, MemoryCacheJSON } from './config';

export interface CacheStats {
    objects: number;
    awaiting: number;
    subscribers: number;
    gcPending: boolean;
}

export interface MemoryCache extends Cache {
  save: (cloned?: boolean) => boolean;
  gc: () => { awaiting: number; cleaned: number };
  stats: () => CacheStats;
}

export function createMemoryCache(config: Partial<MemoryCacheConfig> = {}, rehydrate?: MemoryCacheJSON): MemoryCache {
  const cfg = {
    ...defaultMemoryCacheConfig,
    ...config
  };

  const cache: Record<string, MemoryCacheRecord<unknown>> = {};
  const tags: Record<string, string[]> = {};
  const locks: Record<string, boolean> = {};
  const subs: CacheChangeHandler<unknown>[] = [];
  let gcPending: boolean;

  if (rehydrate) {
    // Process all rehydration data and fill our cache with records.
    const keys = Object.keys(rehydrate.records);
    const now = Date.now();
    let needsGC = false;
    for (const k of keys) {
      const rec = rehydrate.records[k];
      // Those that got expired while they were stored, will be removed.
      if (typeof rec.expiresAt !== 'undefined') {
        if (rec.expiresAt < now) {
          continue;
        }
        needsGC = true;
      }
      cache[k] = rec;
      addTags(k, rec.tags);
    }
    if (needsGC) {
      scheduleCleanup();
    }
  }

  function addTags(key: string, ts?: Tag | Tag[]) {
    if (!ts) {
      return;
    }

    const tsa = Array.isArray(ts) ? ts : [ts];
    for (const t of tsa) {
      const existing = tags[t] || [];
      if (cfg.debug) {
        if (existing.indexOf(key) >= 0) {
          throw new Error(`Trying to add tag ${t} for key ${key} which is already there.`);
        }
      }
      existing.push(key);
      tags[t] = existing;
    }
  }

  function removeTags(key: string) {
    const rec = cache[key];
    if (!rec || !rec.tags) {
      return;
    }

    for (const t of rec.tags) {
      const existing = tags[t];
      if (!existing) {
        continue;
      }
      const index = existing.indexOf(t);
      if (index < 0) {
        if (cfg.debug) {
          throw new Error(`Inconsistent state, tag ${t} doesn't exist for key ${key}`);
        }
        continue;
      }
      existing.splice(index, 1);
      if (existing.length === 0) {
        delete tags[t];
      }
    }
  }

  function removeRecord(key: string) {
    removeTags(key);
    delete cache[key];
    delete locks[key];
  }

  function findByTags(t: Tag | Tag[], match: TagMatch, check?: (key: string) => boolean): string[] {
    let res: string[] = [];
    const tsa = Array.isArray(t) ? t : [t];
    if (tsa.length === 0) {
      return res;
    }

    switch (match) {
      case TagMatch.All:
        {
          // Grab the first tag keys
          const ti: string = tsa[0];
          res = tags[ti] || [];
          let toffset = 1;
          // Now go one by one with the next tags and remove those that are missing
          while (res.length > 0 && toffset < tsa.length) {
            const te = tsa[toffset];
            const next = tags[te] || [];
            res = res.filter(r => next.indexOf(r) >= 0);
            toffset++;
          }
        }
        break;

      case TagMatch.Any:
        {
          const keys: { [key: string]: boolean } = {};
          for (const tag of tsa) {
            const te = tags[tag] || [];
            te.forEach(tt => (keys[tt] = true));
          }
          res = Object.keys(keys);
        }
        break;

      case TagMatch.None:
        {
          Object.keys(cache).forEach(k => {
            const val = cache[k].tags || [];
            const hasNone = tsa.filter(tt => val.indexOf(tt) < 0).length === tsa.length;
            if (hasNone) {
              res.push(k);
            }
          });
        }
        break;
    }

    return check ? res.filter(r => check(r)) : res;
  }

  function scheduleCleanup() {
    if (gcPending) {
      return;
    }
    if (cfg.debug) {
      console.debug(`Scheduling cache cleanup in ${cfg.defaultGCInterval} seconds`);
    }

    gcPending = true;

    setTimeout(() => {
      gcPending = false;
      const res = gc();
      if (cfg.debug) {
        console.debug(`Cache cleanup finished. Cleaned: ${res.cleaned}, awaiting: ${res.awaiting}`);
      }

      if (res.awaiting > 0) {
        scheduleCleanup();
      }
    }, cfg.defaultGCInterval);
  }

  function notify(key: string, value: unknown, change: CacheChange) {
    subs.forEach(l => {
      try {
        l(key, value, change);
      } catch (err) {
        console.error(`Error while notifying subscribers for ${change}. Key: ${key}`, err, value);
      }
    });
  }

  function set<T>(key: string, value: T, ttl?: number, staleTTL?: number, skipNotify?: boolean, ts?: Tag | Tag[]) {
    const actualTTL = typeof ttl === 'undefined' ? cfg.defaultTTL : ttl;
    let fullTTL = actualTTL;
    let actualStaleTTL = typeof staleTTL === 'undefined' ? cfg.defaultStaleTTL : staleTTL;
    if (typeof actualStaleTTL !== 'undefined') {
      if (actualStaleTTL < 0) {
        actualStaleTTL = undefined;
        if (cfg.debug) {
          throw new Error(`StaleTTL (${actualStaleTTL}) should not be less than zero`);
        }
      } else {
        fullTTL += actualStaleTTL;
      }
    }

    const now = Date.now();
    const expiresAt = actualTTL >= 0 ? now + fullTTL : undefined;
    const staleAt = typeof actualStaleTTL !== 'undefined' && actualStaleTTL >= 0 ? now + actualTTL : undefined;
    const rec: MemoryCacheRecord<T> = {
      value,
      expiresAt,
      staleAt,
      ttl,
      staleTTL,
      tags: ts ? (Array.isArray(ts) ? ts : [ts]) : undefined
    };

    cache[key] = rec;
    addTags(key, ts);
    if (!skipNotify) {
      notify(key, value, CacheChange.Update);
    }
    if (actualTTL >= 0) {
      scheduleCleanup();
    }
  }

  function getState<T>(key: string): { value: T; stale?: boolean } | undefined {
    let rec = cache[key] as MemoryCacheRecord<T>;
    if (!rec) {
      return undefined;
    }

    const now = Date.now();
    if (typeof rec.expiresAt !== 'undefined' && now >= rec.expiresAt && !locks[key]) {
      return undefined;
    }

    if (typeof rec.staleAt !== 'undefined' && now >= rec.staleAt) {
      return {
        value: rec.value,
        stale: true
      };
    }

    return {
      value: rec.value
    };
  }

  function get<T>(key: string): T | undefined {
    const value = getState<T>(key);
    return value ? value.value : undefined;
  }

  function has(key: string): boolean {
    return key in cache;
  }

  function clear(key: string) {
    const value = cache[key];
    if (typeof value === 'undefined') {
      return false;
    }

    removeRecord(key);
    notify(key, value.value, CacheChange.Clear);
    return true;
  }

  function clearByTags(ts: Tag | Tag[], match: TagMatch, check?: (key: string) => boolean): number {
    const collected = findByTags(ts, match, check);
    collected.forEach(clear);
    return collected.length;
  }

  function lock(key: string) {
    locks[key] = true;
  }

  function unlock(key: string) {
    if (!(key in locks)) {
      return;
    }

    delete locks[key];
    const value = cache[key];
    if (value && typeof value.expiresAt !== 'undefined') {
      scheduleCleanup();
    }
  }

  function sub<T>(handler: CacheChangeHandler<T>) {
    if (cfg.debug && subs.findIndex(s => s === handler) >= 0) {
      const msg = `There is already an existing subscription for the provided handler.`;
      if (cfg.debug) {
        throw new Error(msg);
      }
      console.warn(msg);
      return;
    }
    subs.push(handler as CacheChangeHandler<unknown>);
  }

  function unsub<T>(handler: CacheChangeHandler<T>) {
    const index = subs.findIndex(h => h === handler);
    if (index < 0) {
      const msg = `Trying to unsubscribe a handler which is not registered.`;
      if (cfg.debug) {
        throw new Error(msg);
      }
      console.warn(msg);
      return;
    }
    subs.splice(index, 1);
  }

  function gc(): { awaiting: number; cleaned: number } {
    const now = Date.now();
    const keys = Object.keys(cache);
    let awaiting = 0;
    let cleaned = 0;
    for (const k of keys) {
      const v = cache[k];
      if (typeof v.expiresAt === 'undefined') {
        continue;
      }

      // Check if locked
      if (locks[k]) {
        continue;
      }

      if (v.expiresAt > now) {
        awaiting++;
        continue;
      }

      cleaned++;
      removeRecord(k);
      notify(k, v.value, CacheChange.Expire);
    }

    return {
      awaiting,
      cleaned
    };
  }

  function stats(): CacheStats {
    const objs = Object.values(cache);
    return {
      objects: objs.length,
      awaiting: objs.filter(v => typeof v.expiresAt !== 'undefined').length,
      subscribers: Object.keys(subs).length,
      gcPending
    };
  }

  function save(cloned?: boolean) {
    if (!cfg.storage) {
        return false;
    }

    let entries: string[] = [];
    if (cfg.storage.matchers.length === 0) {
      entries = Object.keys(cache);
    } else {
        for (const tm of cfg.storage.matchers) {
            entries.push(
                ...findByTags(tm.tags, tm.match)
            );
        }
    }

    const data: MemoryCacheJSON = {version: 1, records: {}};
    for (const e of entries) {
        if (e in data.records) {
            // Duplicates might come up in the multi-matcher,
            // so we just ignore those that were already stored
            continue;
        }
        let record = cache[e];
        // TODO Add serialization on per record base here!
        if (cloned) {
            record = JSON.parse(JSON.stringify(record));
        }
        data.records[e] = record;
    }
    cfg.storage.save(data);
    return true;
  }

  return {
    set,
    lock,
    unlock,
    get,
    getState,
    has,
    findByTags,
    clear,
    clearByTags,
    sub,
    unsub,
    save,
    stats,
    gc
  };
}
