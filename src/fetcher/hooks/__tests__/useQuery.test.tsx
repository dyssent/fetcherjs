// tslint:disable:react-hooks-nesting
import React, { Suspense, useCallback } from 'react';
import { clear } from 'jest-date-mock';
import { render, unmountComponentAtNode } from 'react-dom';
// tslint:disable-next-line:no-submodule-imports
import { act } from 'react-dom/test-utils';

import { wait } from '../../cache/testUtils';
import { useQuery, QueryOptions, QueryCallbacks } from '../useQuery';
import { createManagerWithMemoryCache, Manager } from '../../manager';
import { cacheKeyHash, MemoryCache } from '../../cache';
import { renderHook } from '../testUtils';

function SomeValue<T>(props: { value: T }) {
  return <span>{JSON.stringify(props.value)}</span>;
}

function FetchNumber<T>(props: {
  manager?: Manager;
  key?: string;
  fetcher: () => Promise<T>;
  options?: QueryOptions<T>;
}) {
  const { key = 'key1', options, manager, fetcher } = props;
  const opts = {
    ...(options || {}),
    manager
  };

  const { data, pending, error } = useQuery(key, fetcher, opts);

  return (
    <>
      <span>Loading: {pending ? 'true' : 'false'}&nbsp;</span>
      <span>Error: {typeof error !== 'undefined' ? error.message : 'undefined'}&nbsp;</span>
      <span>Value: {typeof data !== 'undefined' ? <SomeValue value={data} /> : 'undefined'}&nbsp;</span>
    </>
  );
}

function UnstableQueryArgsComponent(props: {
  manager: Manager
}) {
  const { manager } = props;
  const request = useCallback(
    (params: number[]) => new Promise<String>(resolve => resolve(params.map(p => p.toString()).join('.'))),
    []
  );
  useQuery(
    'key',
    request,
    {manager, argsStrict: true},
    [1,2]
  )
  return null;
}

class ErrorBoundary extends React.Component<{}, {hasError: boolean, error?: Error}> {
  constructor(props: {}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // You can also log the error to an error reporting service
    console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
    return <h1>Error happened: {this.state.error?.message}</h1>;
    }

    return this.props.children;
  }
}

describe('useQuery', () => {
  let container: HTMLDivElement;
  let manager: Manager<MemoryCache>;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    manager = createManagerWithMemoryCache();
    // Hiject updates so we can run them in the act scope
    manager.updateConfig({hooks: {
      onNotifySub: (sub, state, reason) => {
        act(() => sub(state, reason));
        return false;
      }
    }});
  });

  afterEach(() => {
    clear();
    jest.useRealTimers();
    if (!container) {
      return;
    }
    document.body.removeChild(container);
    unmountComponentAtNode(container);
    container.remove();
  });

  it('can query and display value', async () => {
    const fetch10 = () => new Promise(resolve => resolve(10));
    act(() => {
      render(
        <>
          <FetchNumber manager={manager} fetcher={fetch10} />
        </>,
        container
      );
    });
    await wait(1);
    expect(container.textContent).toContain('Value: 10');
  });

  it('can query using hook setup', async () => {
    const request = () => new Promise(resolve => resolve(100));
    const hook = renderHook(
      container,
      () => useQuery('key', request, {manager})
    );
    expect(hook.result.current.data).toBeUndefined();
    await wait(1);
    expect(hook.result.current.data).toBe(100);
  });

  it('can refresh', async () => {
    let value = 100;
    const request = () => new Promise(resolve => {
      resolve(value);
      value++;
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager}));
    await wait(1);
    expect(hook.result.current.data).toBe(100);
    act(() => {
      hook.result.current.refresh();
    });
    await wait(1);
    expect(hook.result.current.data).toBe(101);
  });

  it('can respond to mutate', async () => {
    const request = () => new Promise(resolve => {
      resolve(100);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager}));
    await wait(1);
    expect(hook.result.current.data).toBe(100);
    act(() => {
      hook.result.current.mutate(200);
    });
    await wait(1);
    expect(hook.result.current.data).toBe(200);
  });

  it('can provide correct hash', async () => {
    const request = () => new Promise(resolve => {
      resolve(100);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager}));
    await wait(1);
    expect(hook.result.current.data).toBe(100);

    expect(hook.result.current.hash).toBeDefined();
    expect(hook.result.current.hashFunc('key')).toBe(hook.result.current.hash);
    expect(hook.result.current.manager.fromCache(hook.result.current.hash!)).toBe(100);
  });

  it('displays initial value', async () => {
    const request = () => new Promise(resolve => {
      resolve(100);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, initialValue: 10}));
    expect(hook.result.current.data).toBe(10);
    await wait(1);
    expect(hook.result.current.data).toBe(100);
  });

  it('returns fallback value if data is undefined', async () => {
    const err = 'Error ...';
    const request = () => new Promise((resolve, reject) => {
      reject(err);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, fallbackValue: 10}));
    expect(hook.result.current.data).toBe(10);
    await wait(1);
    expect(hook.result.current.data).toBe(10);
    expect(hook.result.current.error).toBe(err);
  });

  it('can poll using provided refresh interval', async () => {
    let value = 1;
    const request = () => new Promise(resolve => {
      resolve(value);
      value++;
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, refreshInterval: 100}));
    expect(hook.result.current.data).toBeUndefined();
    await wait(1);
    expect(hook.result.current.data).toBe(1);
    await wait(100);
    expect(hook.result.current.data).toBe(2);
    await wait(100);
    expect(hook.result.current.data).toBe(3);
  });

  it('can call callbacks', async () => {
    const hits = {
      success: 0,
      error: 0,
      retry: 0,
      request: 0,
      complete: 0,
      update: 0
    };
    const callbacks: QueryCallbacks<number, string> = {
      onComplete: () => hits.complete = hits.complete + 1,
      onError: () => hits.error = hits.error + 1,
      onSuccess: () => hits.success = hits.success + 1,
      onRetry: () => hits.retry = hits.retry + 1,
      onRequest: () => hits.request = hits.request + 1,
      onUpdate: (_, reasons) => {
        hits.update = hits.update + 1;
      }
    };
    let value = 0;
    const request = () => new Promise((resolve, reject) => {
      value++;
      if (value < 2) {
        reject('Error');
        return;
      }
      resolve(value);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, retries: 2, ...callbacks}));
    expect(hook.result.current.data).toBeUndefined();
    await wait(1);
    // By this time we'll have:
    // Update: pending, fetching, error but with a retry
    expect(hits.update).toBe(3);
    expect(hits.request).toBe(1);
    await wait(2500);
    // By this time we should have:
    // Update: fetching, success
    expect(hits.update).toBe(5);
    expect(hits.success).toBe(1);
    expect(hits.retry).toBe(1);
  });

  it('can call call error callback', async () => {
    let reportedError = false;
    let reportedComplete = false;
    const onError = () => reportedError = true;
    const onComplete = () => reportedComplete = true;

    const request = () => new Promise((resolve, reject) => {
      reject('Error');
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, onError, onComplete}));
    expect(hook.result.current.data).toBeUndefined();
    await wait(1);
    expect(reportedError).toBe(true);
    expect(reportedComplete).toBe(true);
  });

  it('should use cached value for the initial state', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(100);
    });
    const hash = cacheKeyHash('key');
    manager.updateCache(hash, 50);
    const hook = renderHook(container, () => useQuery('key', request, {manager}));
    expect(hook.result.current.data).toBe(50);
    await wait(1);
    expect(hook.result.current.hash).toBe(hash);
    expect(hook.result.current.data).toBe(50);
    expect(calls).toBe(0);
  });

  it('should use stale cache value for the initial state but still perform a request', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(100);
    });
    const hash = cacheKeyHash('key');
    manager.updateCache(hash, 50, {ttl: 100, staleTTL: 100});
    await wait(150);
    // Should be stale now
    const hook = renderHook(container, () => useQuery('key', request, {manager}));
    expect(hook.result.current.data).toBe(50);
    await wait(1);
    expect(hook.result.current.hash).toBe(hash);
    expect(hook.result.current.data).toBe(100);
    expect(calls).toBe(1);
  });

  it('can delay', async () => {
    let hit = false;
    const request = () => new Promise(resolve => {
      hit = true;
      resolve(1);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, delay: 500}));
    await wait(1);
    expect(hit).toBe(false);
    expect(hook.result.current.data).toBeUndefined();
    await wait(200);
    expect(hit).toBe(false);
    expect(hook.result.current.data).toBeUndefined();
    await wait(300);
    expect(hit).toBe(true);
    expect(hook.result.current.data).toBe(1);
  });

  it('unmounting and mounting should restore the value from cache', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(1);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager}));
    await wait(1);
    expect(hook.result.current.data).toBe(1);
    expect(calls).toBe(1);
    act(() => {
      hook.unmount();
    });
    await wait(1);
    act(() => {
      hook.mount();
    });
    await wait(1);
    expect(hook.result.current.data).toBe(1);
    expect(calls).toBe(1);
  });

  it('can be manually requested', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(1);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, manual: true}));
    await wait(1);
    expect(calls).toBe(0);
    expect(hook.result.current.data).toBeUndefined();
    hook.result.current.refresh();
    await wait(1);
    expect(calls).toBe(1);
    expect(hook.result.current.data).toBe(1);
  });

  it('can be manually requested and cancelled while ongoing', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(1);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, manual: true, delay: 500}));
    await wait(1);
    expect(calls).toBe(0);
    expect(hook.result.current.data).toBeUndefined();
    hook.result.current.refresh();
    await wait(100);
    hook.result.current.cancel();
    await wait(1000);
    expect(calls).toBe(0);
    expect(hook.result.current.data).toBeUndefined();
    hook.result.current.refresh();
    await wait(500);
    expect(calls).toBe(1);
    expect(hook.result.current.data).toBe(1);
  });

  it('can suspense then query', async () => {
    const fetch10 = () => new Promise(resolve => resolve(10));
    act(() => {
      render(
        <Suspense fallback={<span>Suspensed</span>}>
          <FetchNumber
            manager={manager}
            fetcher={fetch10}
            options={{
              suspense: true
            }}
          />
        </Suspense>,
        container
      );
    });
    expect(container.textContent).toContain('Suspensed');
    await wait(5);
    expect(container.textContent).toContain('Value: 10');
  });

  it('can suspense then query then fail on error', async () => {
    const fetch10 = () => new Promise((resolve, reject) => reject(new Error(`Problems...`)));
    act(() => {
      render(
        <ErrorBoundary>
          <Suspense fallback={<span>Suspensed</span>}>
            <FetchNumber
              manager={manager}
              fetcher={fetch10}
              options={{
                suspense: true
              }}
            />
          </Suspense>
        </ErrorBoundary>,
        container
      );
    });
    expect(container.textContent).toContain('Suspensed');
    await wait(5);
    expect(container.textContent).toContain('Error');
  });

  it('can be refreshed via tags', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(calls);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, tags: ['tag']}));
    await wait(1);
    expect(calls).toBe(1);
    expect(hook.result.current.data).toBe(1);

    manager.refetchByTags('tag');
    await wait(1);
    expect(calls).toBe(2);
    expect(hook.result.current.data).toBe(2);
  });

  it('can correctly provide extracted value', async () => {
    const extract = (value: {num: number}) => value.num;
    const request = () => new Promise<{num: number}>(resolve => {
      resolve({num: 5});
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, transform: extract}));
    await wait(1);
    expect(hook.result.current.data).toBe(5);
  });

  it('can correctly validate successful payloads', async () => {
    const error = 'Should be more than 5';
    const validate = (value: number) => value <= 5 ? error : undefined;
    const request = () => new Promise<number>(resolve => {
      resolve(5);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, validate}));
    await wait(1);
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.error).toBe(error);
  });

  it('should not update cache if value is equal', async () => {
    const equalityCheck = (left: {num: number}, right: {num: number}) => left.num === right.num;
    let calls = 0;
    const request = () => new Promise<{num: number}>(resolve => {
      calls++;
      resolve({num: 5});
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, equalityCheck}));
    await wait(1);
    const firstResult = hook.result.current.data;
    expect(firstResult?.num).toBe(5);
    expect(calls).toBe(1);
    hook.result.current.refresh();
    await wait(1);
    expect(firstResult === hook.result.current.data).toBe(true);
    expect(calls).toBe(2);
  });

  it('can batch requests', async () => {
    let calls = 0;
    const request = (value: number | number[]) => new Promise<number | number[]>(resolve => {
      calls++;
      if (Array.isArray(value)) {
        resolve(value.map(v => v + 100));
      } else {
        resolve(value + 100);
      }
    });

    const batcher = (args: [number][]) => new Promise<number[]>(async resolve => {
      const vals = args.map(a => a[0]);
      const res = await request(vals);
      resolve(res as number[]);
    });

    let hook1Data: number | undefined = 0;
    let hook2Data: number | undefined = 0;

    const DoubleHook = () => {
      const data1 = useQuery('key1', request, {manager, batcher, tags: ['tag'], delay: 1000}, 1);
      const data2 = useQuery('key2', request, {manager, batcher, tags: ['tag'], delay: 1000}, 2);
      hook1Data = data1.data as number;
      hook2Data = data2.data as number;
      return null;
    };

    act(() => {
      render(
        <>
          <DoubleHook />
        </>,
        container
      );
    });

    await wait(1001);
    expect(calls).toBe(1);
    expect(hook1Data).toBe(101);
    expect(hook2Data).toBe(102);
  });

  it('can retain a value after a key switch', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(calls);
    });
    const hook = renderHook(container, useQuery, 'key', request, {manager, retainPreviousValue: true});
    await wait(1);
    expect(hook.result.current.data).toBe(1);
    act(() => {
      hook.updateArgs('key2', request, {manager, retainPreviousValue: true});
    });
    await wait(1);
    expect(hook.result.current.data).toBe(2);
    expect(hook.result.current.previousValue).toBe(1);
  });

  it('can debounce via delay + cancel functionality', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(calls);
    });
    const opts = {manager, delay: 100, debounce: true};
    const hook = renderHook(container, useQuery, 'key', request, opts);
    await wait(20);
    expect(hook.result.current.data).toBeUndefined();
    expect(calls).toBe(0);
    act(() => {
      hook.updateArgs('key2', request, opts);
    });
    await wait(110);
    expect(hook.result.current.data).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not request if a key is false', async () => {
    let calls = 0;
    const request = () => new Promise(resolve => {
      calls++;
      resolve(calls);
    });
    const hook = renderHook(container, useQuery, false, request, {manager});
    await wait(1);
    expect(hook.result.current.data).toBeUndefined();
    expect(calls).toBe(0);
    act(() => {
      hook.updateArgs('key', request, {manager});
    });
    await wait(1);
    expect(hook.result.current.data).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not request if a key function throws', async () => {
    const request = () => new Promise(resolve => {
      resolve(1);
    });
    let threw = false;
    const keyFunc = () => {
      threw = true;
      throw new Error(`Faulty key`);
    };
    const hook = renderHook(container, useQuery, keyFunc, request, {manager});
    await wait(1);
    expect(hook.result.current.data).toBeUndefined();
    expect(threw).toBe(true);
    act(() => {
      hook.updateArgs('key', request, {manager});
    });
    await wait(1);
    expect(hook.result.current.data).toBe(1);
  });

  it('cleans up value for the key if hook is unmounted', async () => {
    const request = () => new Promise(resolve => {
      resolve(1);
    });
    const hook = renderHook(container, () => useQuery('key', request, {manager, ttl: 100, staleTTL: 100}));
    await wait(1);
    const cacheKey = hook.result.current.hash;
    act(() => {
      hook.unmount();
    });
    await wait(1);
    expect(manager.getCache().has(cacheKey!)).toBe(true);
    await wait(200);
    // Force GC as it may take a bit of time to hit
    manager.getCache().gc();
    expect(manager.getCache().has(cacheKey!)).toBe(false);
  });

  it('can correctly chain hooks dependencies', async () => {
    let called1 = 0;
    const request = () => new Promise<{value: number}>(resolve => {
      called1++;
      resolve({value: 100});
    });
    let called2 = 0;
    const deprequest = () => new Promise<number>(resolve => {
      called2++;
      resolve(200);
    });

    const DepHooks = () => {
      const data1 = useQuery<{value: number}>('key1', request, {manager, delay: 50});
      const data2 = useQuery<number>(() => data1.data!.value + 'key2', deprequest, {manager, delay: 50});

      return (
        <>
          <span>{data1.data ? data1.data.value : 'Loading 1'}</span>
          <span>{data2.data ? data2.data : 'Loading 2'}</span>
        </>
      );
    };

    act(() => {
      render(
        <>
          <DepHooks />
        </>,
        container
      );
    });

    expect(container.textContent).toContain('Loading 1');
    expect(container.textContent).toContain('Loading 2');
    expect(called1).toBe(0);
    expect(called2).toBe(0);
    await wait(50);
    expect(container.textContent).toContain('100');
    expect(container.textContent).toContain('Loading 2');
    expect(called1).toBe(1);
    expect(called2).toBe(0);
    await wait(50);
    expect(container.textContent).toContain('100');
    expect(container.textContent).toContain('200');
    expect(called1).toBe(1);
    expect(called2).toBe(1);
  });

  it('should render with minimal redraws', async () => {
    const request = () => new Promise(resolve => resolve(100));
    const hook = renderHook(
      container,
      () => useQuery('key', request, {manager, delay: 500})
    );
    await wait(50);
    expect(hook.result.current.data).toBeUndefined();
    // Initial + Pending
    expect(hook.draws.current).toBe(2);
    await wait(1000);
    // Fetching + Success
    expect(hook.draws.current).toBe(4);
  });

  it('single render on manual hook at first', async () => {
    const request = () => new Promise(resolve => resolve(100));
    const hook = renderHook(
      container,
      () => useQuery('key', request, {manager, manual: true})
    );
    await wait(50);
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.draws.current).toBe(1);
  });

  it('should withstand unstable args with minimal redraws', async () => {
    const request = (params: number[]) => new Promise<String>(resolve => resolve(params.map(p => p.toString()).join('.')));
    const hook = renderHook(
      container,
      () => useQuery('key', request, {manager}, [1,2])
    );
    await wait(50);
    expect(hook.result.current.data).toBe('1.2');
    // Initial, Pending + Fetching, Success
    expect(hook.draws.current).toBe(3);
  });

  // Current request function is okay to be unstable, so we no
  // longer tets for this.
  // it('should report unstable request function', async () => {
  //   function UnstableQueryRequestComponent(props: {
  //     manager: Manager
  //   }) {
  //     const { manager } = props;
  //     useQuery(
  //       'key',
  //       (params: number[]) => new Promise<String>(resolve => resolve(params.map(p => p.toString()).join('.'))),
  //       {manager},
  //       [1,2]
  //     )
  //     return null;
  //   }
  //
  //   act(() => {
  //     render(
  //       <ErrorBoundary>
  //         <UnstableQueryRequestComponent manager={manager} />
  //       </ErrorBoundary>,
  //       container
  //     );
  //   });
  //   await wait(5);
  //   expect(container.textContent).toContain('Error');
  //   expect(container.textContent).toContain('Unstable request function detected');
  // });

  it('should report unstable arguments', async () => {
    act(() => {
      render(
        <ErrorBoundary>
          <UnstableQueryArgsComponent manager={manager} />
        </ErrorBoundary>,
        container
      );
    });
    await wait(5);
    expect(container.textContent).toContain('Error');
    expect(container.textContent).toContain('Unstable arguments detected');
  });

  // TODO Add tests for rehydration of a cache
  // TODO Add tests with a global config, including with outter Cache context
  // TODO Add one more test for storage, even though would be a bit of redundant with the manager tests
});
