import { CacheConfig } from '../config';
import { Tag, TagMatch } from '../tag';

/**
 * @internal
 */
export interface MemoryCacheRecord<T> {
  value: T;
  expiresAt?: number;
  staleAt?: number;
  ttl?: number;
  staleTTL?: number;
  tags?: Tag[];
}

/**
 * Memory Cache state JSON for further serialization
 */
export interface MemoryCacheJSON {
  version: 1;
  records: Record<string, MemoryCacheRecord<unknown>>;
}

/**
 * Memory Cache storage configuration
 */
export interface MemoryCacheStorageConfig {
  /**
   * Save gets called when cache records are ready for serialization.
   * data is a set of records that qualify the matchers. This save
   * function must be stable.
   */
  save: (data: MemoryCacheJSON) => void;
  /**
   * Matchers to be applied to records before saving. If none are provided,
   * all records will be preserved.
   */
  matchers: {
    tags: Tag[];
    match: TagMatch;
  }[];
}

/**
 * Memory Cache configuration
 */
export interface MemoryCacheConfig extends CacheConfig {
  /**
   * Enable debug information.
   */
  debug?: boolean;
  /**
   * Storage configuration
   */
  storage?: MemoryCacheStorageConfig;
}

const fiveMinutes = 60 * 5 * 1000;

/**
 * Default memory cache configuration
 */
export const defaultMemoryCacheConfig: MemoryCacheConfig = {
  defaultTTL: fiveMinutes,
  defaultStaleTTL: fiveMinutes,
  defaultGCInterval: 60 * 5 * 1000
};
