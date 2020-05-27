import { createMemoryCache, MemoryCacheConfig } from '../cache';
import { ManagerConfig } from './config';
import { createManager } from './manager';

export function createManagerWithMemoryCache(
  config: Partial<ManagerConfig> = {},
  cacheConfig?: Partial<MemoryCacheConfig>) {
  const memoryCache = createMemoryCache(cacheConfig);
  return createManager(config, memoryCache);
}
