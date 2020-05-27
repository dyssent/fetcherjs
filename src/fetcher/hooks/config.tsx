import React, { useContext } from 'react';
import { MemoryCacheConfig, createMemoryCache } from '../cache';
import { ManagerConfig, createManager } from '../manager';
import { ManagerContext, CacheContext } from './context';
import { useMemoUnstable } from './useMemoUnstable';
import { QueryOptions } from './useQuery';

export interface FetcherConfigProps {
  /**
   * Cache configuration, if provided it will be used
   * to create an instanceof of a MemoryCache. If a cache from the context
   * is meant to be used - keep this value undefined.
   */
  cache?: MemoryCacheConfig;
  /**
   * Manager configuration, if provided will be used
   * to create an instanceof of a Manager. If a manager from the context
   * is meant  to be used - keep this value undefined.
   */
  manager?: ManagerConfig;
  /**
   * Default query options
   */
  query?: QueryOptions<unknown>;
}

/**
 * Fetcher global configuration, should wrap the rest of the application for those to apply.
 */
export const FetcherConfig = React.memo((props: React.PropsWithChildren<FetcherConfigProps>) => {
  const {
    cache: cacheConfig,
    manager: managerConfig,
    children
  } = props;

  const defaultCache = useContext(CacheContext);
  const defaultManager = useContext(ManagerContext);

  const cache = useMemoUnstable(() => {
    if (!cacheConfig) {
      return defaultCache;
    }
    return createMemoryCache(cacheConfig);
  }, [cacheConfig, defaultCache]);

  const manager = useMemoUnstable(() => {
    if (!managerConfig) {
      return defaultManager;
    }
    return createManager(managerConfig, cache);
  }, [managerConfig, defaultManager]);

  return (
    <ManagerContext.Provider
      value={manager}
    >
      {children}
    </ManagerContext.Provider>
  );
});
