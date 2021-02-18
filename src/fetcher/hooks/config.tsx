import React, { useContext } from 'react';
import { MemoryCacheConfig, createMemoryCache, MemoryCacheJSON, MemoryCache, Cache } from '../cache';
import { ManagerConfig, createManager, Manager } from '../manager';
import { ManagerContext, CacheContext } from './context';
import { useMemoUnstable } from './useMemoUnstable';
import { QueryOptions } from './useQuery';

export interface FetcherConfigProps<C extends Cache = Cache> {
  /**
   * Cache configuration, if provided it will be used
   * to create an instanceof of a MemoryCache. If a cache from the context
   * is meant to be used - keep this value undefined.
   */
  cache?: Partial<MemoryCacheConfig>;
  /**
   * Provide the data here to rehydrate the cache from pre-saved data
   */
  cacheInitialData?: MemoryCacheJSON;
  /**
   * An existing cache instance to be used
   */
  cacheInstance?: C;
  /**
   * Manager configuration, if provided will be used
   * to create an instanceof of a Manager. If a manager from the context
   * is meant  to be used - keep this value undefined.
   */
  manager?: Partial<ManagerConfig>;
  /**
   * Provide an existing instance of a manager to be used instead
   * of a dynamically created on.
   */
  managerInstance?: Manager<C>;
  /**
   * Default query options
   */
  query?: Partial<QueryOptions<unknown>>;
}

/**
 * Fetcher global configuration, should wrap the rest of the application for those to apply.
 */
export const FetcherConfig = React.memo((props: React.PropsWithChildren<FetcherConfigProps>) => {
  const {
    cache: cacheConfig,
    cacheInitialData,
    cacheInstance,
    manager: managerConfig,
    managerInstance,
    children
  } = props;

  const defaultCache = useContext(CacheContext);
  const defaultManager = useContext(ManagerContext);

  const cache = useMemoUnstable(() => {
    if (cacheInstance) {
      if (cacheConfig) {
        console.warn(`Fetcher Cache instance is provided along with a manager config, only instance will be used.`);
      }
      return cacheInstance;
    }
    if (cacheConfig) {
      return createMemoryCache(cacheConfig, cacheInitialData);
    }
    return defaultCache;
  }, [cacheConfig, defaultCache, cacheInstance, cacheInitialData]);

  const manager = useMemoUnstable(() => {
    if (managerInstance) {
      if (managerConfig) {
        console.warn(`Fetcher Manager instance is provided along with a manager config, only instance will be used.`);
      }
      return managerInstance;
    }
    if (managerConfig) {
      return createManager(managerConfig, cache); 
    }
    return defaultManager;
  }, [managerConfig, defaultManager, managerInstance]);

  return (
    <ManagerContext.Provider
      value={manager}
    >
      {children}
    </ManagerContext.Provider>
  );
});
