import { CacheConfig } from '../config';
import { cacheKeyHash } from '../key';
import { Tag, TagMatch } from '../tag';

export interface MemoryCacheRecord<T> {
  value: T;
  expiresAt?: number;
  staleAt?: number;
  ttl?: number;
  staleTTL?: number;
  tags?: Tag[];
}

export interface MemoryCacheJSON {
  version: 1;
  records: Record<string, MemoryCacheRecord<unknown>>;
}

export interface MemoryCacheStorageConfig {
  /**
   * Save gets called when cache records are ready for serialization.
   * data is a set of records that qualify the matchers. This save
   * function must be stable.
   */
  save: (data: MemoryCacheJSON) => void;
  matchers: {
    tags: Tag[];
    match: TagMatch;
  }[];
}

export interface MemoryCacheConfig extends CacheConfig {
  debug?: boolean;
  storage?: MemoryCacheStorageConfig;
}

const fiveMinutes = 60 * 5 * 1000;
export const defaultMemoryCacheConfig: MemoryCacheConfig = {
  defaultTTL: fiveMinutes,
  defaultStaleTTL: fiveMinutes,
  defaultGCInterval: 60 * 5 * 1000
};
