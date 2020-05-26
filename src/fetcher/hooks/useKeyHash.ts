import { useMemo, useCallback } from 'react';

import { computeCacheKey, cacheKeyHash, CacheKeyFunc, CacheKeyParam } from '../cache';

export function useKeyHash(
  key: CacheKeyParam,
  func?: CacheKeyFunc
): [string | undefined, (kp: CacheKeyParam) => string | undefined] {
  const hashFunc = useCallback(
    (kp: CacheKeyParam) => {
      const hf: CacheKeyFunc = func || cacheKeyHash;
      return computeCacheKey(kp, hf);
    },
    [func]
  );
  const hash = useMemo(() => hashFunc(key), [key]);

  return [hash, hashFunc];
}
