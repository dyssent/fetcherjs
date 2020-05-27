
/**
 * Base cache configuration
 */
export interface CacheConfig {
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
}
