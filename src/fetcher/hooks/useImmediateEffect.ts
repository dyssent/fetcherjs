import { useRef, useEffect } from 'react';

const dummy = (): void => {
  // Do nothing here
};

type EffectFuncResult = void | (() => void);
export function useImmediateEffect<F extends (first?: boolean) => EffectFuncResult, D extends unknown[]>(func: F, deps: D) {
  const mounted = useRef(false);
  const cancel = useRef<EffectFuncResult | undefined>();

  if (!mounted.current) {
    // Do the first call and capture the cancellation
    // that we later need to execute once the next effect
    // will be actually applied
    mounted.current = true;
    cancel.current = func(true) || dummy;
  }

  useEffect(() => {
    if (cancel.current) {
      const ret = cancel.current;
      // We've already called the method, just return the current
      // and set it to false. Later, actual func will be called on further
      // redraws.
      // Release this ref, so we don't keep it in memory for the rest of the
      // life of this hook.
      cancel.current = undefined;
      return ret;
    }

    return func();
  }, [...deps]);
}
