import { CacheConfig } from '../config';
import { Tag } from '../tag';

export interface MemoryCacheRecordColdValue<ST> {
  t: 'c';
  v: ST;
}

export interface MemoryCacheRecordHotValue<T> {
  t: 'h';
  v: T;
}

/**
 * @internal
 */
export interface MemoryCacheRecord<T, ST> {
  value: MemoryCacheRecordColdValue<ST> | MemoryCacheRecordHotValue<T>;
  expiresAt?: number;
  staleAt?: number;
  ttl?: number;
  staleTTL?: number;
  tags?: Tag[];
  serializer?: (value: T) => ST;
}

export type MemoryCacheRecordValueJSON<T, ST> = Omit<MemoryCacheRecord<T, ST>, 'value' | 'serializer'> & {value: ST};
export type MemoryCacheRecordJSON<T, ST> = Record<string, MemoryCacheRecordValueJSON<T, ST>>

/**
 * Memory Cache state JSON for further serialization
 */
export interface MemoryCacheJSON {
  version: 1;
  records: MemoryCacheRecordJSON<unknown, unknown>;
}

/**
 * Memory Cache configuration
 */
export interface MemoryCacheConfig extends CacheConfig<MemoryCacheJSON> {
  /**
   * Enable debug information.
   */
  debug?: boolean;
}

const fiveMinutes = 60 * 5 * 1000;
const fiveSeconds = 0;
/**
 * Default memory cache configuration
 */
export const defaultMemoryCacheConfig: MemoryCacheConfig = {
  defaultTTL: fiveSeconds,
  defaultStaleTTL: fiveMinutes,
  defaultGCInterval: 60 * 5 * 1000
};
