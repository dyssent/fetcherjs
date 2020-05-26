// tslint:disable:react-hooks-nesting
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { render } from 'react-dom';
// tslint:disable-next-line:no-submodule-imports
import { act } from 'react-dom/test-utils';

export interface RenderHookControls<T, A extends unknown[]> {
  result: React.MutableRefObject<T>;
  draws: React.MutableRefObject<number>;
  mount: () => void;
  unmount: () => void;
  rerender: () => void;
  updateArgs: (...hookArgs: A) => void;
}

export function HookComponent<T, A extends unknown[]>(props: {hook: (...args: A) => T, hookArgs: A, onRender: (value: T) => void}) {
  const { hook: useHook, hookArgs, onRender } = props;
  const result = useHook(...hookArgs);
  onRender(result);
  return null;
}

export function HookHostComponent<T, A extends unknown[]>(props: {
  hook: () => T,
  hookArgs: A,
  refs: (
    refs: RenderHookControls<T, A>
  ) => void}
) {
  const [args, setArgs] = useState<A>(props.hookArgs);
  const [mounted, setMounted] = useState(true);
  const [, setRender] = useState({});

  const drawsRef = useRef(0);
  const valueRef = useRef<T>();
  const rerender = useCallback(() => setRender({}), []);
  const updateArgs = useCallback((...hookArgs: A) => setArgs(hookArgs), []);
  const mount = useCallback(() => setMounted(true), []);
  const unmount = useCallback(() => setMounted(false), []);
  const renderCallback = useCallback((value: T) => {
    act(() => {
      valueRef.current = value;
      drawsRef.current = drawsRef.current + 1;
    });
  }, []);
  useMemo(() => {
    props.refs({result: valueRef as any, draws: drawsRef, mount, unmount, rerender, updateArgs});
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <HookComponent<T, A> hook={props.hook} hookArgs={args} onRender={renderCallback} />
  );
}

export function renderHook<T, A extends unknown[]>(container: HTMLDivElement, hook: (...hookArgs: A) => T, ...hookArgs: A): RenderHookControls<T, A> {
  let result: RenderHookControls<T, A>;

  const assign = (refs: RenderHookControls<T, A>) => (result = refs);

  act (() => {
    render(
      <HookHostComponent<T, A>
        hook={hook}
        hookArgs={hookArgs}
        refs={assign}
      />,
      container
    );
  });

  return result!;
}
