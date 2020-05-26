import { Tag, TagMatch } from './tag';

export enum CacheChange {
  Update = 'update',
  Clear = 'clear',
  Expire = 'expire'
}

export type CacheChangeHandler<T> = (key: string, value: T, change: CacheChange) => void;

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
