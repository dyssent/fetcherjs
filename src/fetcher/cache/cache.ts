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
 * Cache interface
 */
export interface Cache {
  set: <T>(key: string, value: T, ttl?: number, staleTTL?: number, skipNotify?: boolean, tags?: Tag | Tag[]) => void;
  lock: (key: string) => void;
  unlock: (key: string) => void;

  get: <T>(key: string) => T | undefined;
  getState: <T>(key: string) => { value: T; stale?: boolean } | undefined;
  has: (key: string) => boolean;
  findByTags: (tags: Tag | Tag[], match: TagMatch, check?: (key: string) => boolean) => string[];

  clear: (key: string) => boolean;
  clearByTags: (tags: Tag | Tag[], match: TagMatch, check?: (key: string) => boolean) => number;

  sub: <T>(handler: CacheChangeHandler<T>) => void;
  unsub: <T>(handler: CacheChangeHandler<T>) => void;
}
