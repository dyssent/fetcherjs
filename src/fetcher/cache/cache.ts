import { Tag, TagMatch } from './tag';

/**
 * A set of cache change reasons
 */
export enum CacheChange {
  Update = 'update',
  Clear = 'clear',
  Expire = 'expire'
}

/**
 * Handler for cache changes, used to notify subscribers.
 */
export type CacheChangeHandler<T> = (key: string, value: T, change: CacheChange) => void;

/**
 * Serializer to be used when a cache is about to be moved to a storage
 */
export type CacheValueSerializer<T, ST> = (value: T) => ST;

/**
 * Deserializer to be used when a value is pulled from a cache, but it is
 * in the cold - dried state. This is then used to move it to a hot store
 * and returned to the user.
 */
export type CacheValueDeserializer<T, ST> = (value: ST) => T;

/**
 * Cache interface
 */
export interface Cache {
  set: <T, ST = T>(key: string, value: T, options?: {
    ttl?: number,
    staleTTL?: number,
    skipNotify?: boolean,
    tags?: Tag | Tag[],
    serializer?: CacheValueSerializer<T, ST>
  }) => void;
  lock: (key: string) => void;
  unlock: (key: string) => void;

  get: <T, ST = T>(key: string, deserializer?: CacheValueDeserializer<T, ST>) => T | undefined;
  getState: <T, ST = T>(key: string, deserializer?: CacheValueDeserializer<T, ST>) => { value: T; stale?: boolean } | undefined;
  has: (key: string) => boolean;
  findByTags: (tags: Tag | Tag[], match: TagMatch, check?: (key: string) => boolean) => string[];

  clear: (key: string) => boolean;
  clearByTags: (tags: Tag | Tag[], match: TagMatch, check?: (key: string) => boolean) => number;

  sub: <T>(handler: CacheChangeHandler<T>) => void;
  unsub: <T>(handler: CacheChangeHandler<T>) => void;

  save: (cloned?: boolean) => boolean;
}
