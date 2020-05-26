import { useContext, useEffect, useState } from 'react';

import { Manager, ManagerContext, RequestState } from '../manager';

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
