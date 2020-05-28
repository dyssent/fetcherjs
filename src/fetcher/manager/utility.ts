import { createMemoryCache, MemoryCacheConfig, TagMatch, Tag, MemoryCacheJSON } from '../cache';
import { ManagerConfig } from './config';
import { createManager } from './manager';

/**
 * @internal
 */
export function tagsMatch(requestTags: Tag[] | undefined, tags: Tag[], match: TagMatch): boolean {
  if (!requestTags) {
    return false;
  }

  switch (match) {
    case TagMatch.All:
      return (
        requestTags.length === tags.length &&
        tags.filter(t => requestTags.indexOf(t) >= 0).length === requestTags.length
      );

    case TagMatch.Any:
      return tags.findIndex(t => requestTags.indexOf(t) >= 0) >= 0 ? true : false;

    case TagMatch.None:
      return tags.findIndex(t => requestTags.indexOf(t) >= 0) >= 0 ? false : true;
  }
}  

export function createManagerWithMemoryCache(
  config: Partial<ManagerConfig> = {},
  cacheConfig?: Partial<MemoryCacheConfig>,
  cacheData?: MemoryCacheJSON) {
  const memoryCache = createMemoryCache(cacheConfig, cacheData);
  return createManager(config, memoryCache);
}

/**
 * @internal
 */
export const isSSR = typeof window === 'undefined';
