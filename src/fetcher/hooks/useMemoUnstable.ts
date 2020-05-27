import { useRef } from 'react';
import { deepEqual } from './utils';

/**
 * @internal
 */
export function useMemoUnstable<T>(
  func: () => T,
  deps?: unknown[],
  depth?: number,
  strict?: boolean): T {

  const ref = useRef<{value?: T, first: boolean, deps?: unknown[]}>({deps, first: true});
  if (ref.current.first || !deepEqual(ref.current.deps, deps, depth, strict)) {
    ref.current.first = false;
    ref.current.value = func();
    ref.current.deps = deps;
  }
  
  return ref.current.value!;
}
