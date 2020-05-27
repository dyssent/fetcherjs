import { useRef } from 'react';
import { deepEqual } from './utils';

export function useCallbackUnstable<F extends (...args: any[]) => any>(
  callback: F,
  deps?: unknown[],
  depth?: number,
  strict?: boolean): F {

  const ref = useRef({callback, deps});

  if (!deepEqual(ref.current.deps, deps, depth, strict)) {
    ref.current.callback = callback;
    ref.current.deps = deps;
  }
  
  return ref.current.callback;
}
