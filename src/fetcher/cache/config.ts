import { Tag, TagMatch } from './tag';

/**
 * Cache storage configuration
 */
export interface CacheStorageConfig<ColdCacheJSON> {
  /**
   * Save gets called when cache records are ready for serialization.
   * data is a set of records that qualify the matchers. This save
   * function must be stable.
   */
  save: (data: ColdCacheJSON) => void;
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
 * Base cache configuration
 */
export interface CacheConfig<ColdCacheJSON> {
  /**
   * defaultTTL to be applied to records
   */
  defaultTTL: number;
  /**
   * default Stale TTL for records.
   */
  defaultStaleTTL?: number;
  /**
   * default garbage collector interval
   */
  defaultGCInterval: number;
  /**
   * Storage configuration
   */
  storage?: CacheStorageConfig<ColdCacheJSON>;
}
