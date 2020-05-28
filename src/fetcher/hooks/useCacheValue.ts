import { useContext, useEffect, useState } from 'react';

import { Manager, RequestState } from '../manager';
import { ManagerContext } from './context';

/**
 * Observer for a value in a cache using the provided key.
 * @template T Type stored in the cache.
 * @template E Error type, which matches the one used in the request function.
 * 
 * @param key
 * @param options 
 */
export function useCacheValue<T, E = Error>(
  key?: string,
  options?: {
    manager?: Manager;
  }
) {
  const opt = options || {};
  const contextManager = useContext(ManagerContext);
  const manager = opt.manager || contextManager;

  if (!manager) {
    throw new Error(`Manager must be provided explicitly or through a context`);
  }

  const [state, setState] = useState<RequestState<T, E> | undefined>(() => {
    if (!key) {
      return undefined;
    }
    return manager.state<T, E>(key);
  });

  useEffect(() => {
    if (!key) {
      return;
    }

    return manager.sub<T, E, unknown>(key, s => setState(s));
  }, [manager, key]);

  return state ? state : {};
}
