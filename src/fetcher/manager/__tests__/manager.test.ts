import { SubReason } from '../config';
import { requestStorageJSON } from '../request';
import { TagMatch } from '../../cache';
import { createManagerWithMemoryCache } from '../utility';

const wait = async (time: number) => new Promise(resolve => setTimeout(resolve, time));

describe('query-manager', () => {
  const key1 = 'key1';
  const key2 = 'key2';
  const key3 = 'key3';

  it('can perform request', async () => {
    const manager = createManagerWithMemoryCache();
    const request = () =>
      new Promise(resolve => {
        resolve(10);
      });

    manager.request(key1, request);

    await wait(5);
    const result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(10);
  });

  it('can bundle multiple requests into one', async () => {
    const manager = createManagerWithMemoryCache();
    let requests = 0;
    const request = () =>
      new Promise(resolve => {
        requests++;
        resolve(1);
      });

    manager.request(key1, request);
    manager.request(key1, request);
    manager.request(key2, request);

    await wait(50);
    expect(requests).toBe(2);
    expect(manager.state(key1)).not.toBe(undefined);
  });

  it('ignores request if there is fresh data', async () => {
    const manager = createManagerWithMemoryCache();
    let calls = 0;
    const request = () =>
      new Promise(resolve => {
        calls++;
        resolve(calls);
      });

    manager.request(key1, request);
    await wait(5);
    let result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(1);

    // Should ignore now
    manager.request(key1, request);
    await wait(5);
    result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(1);
  });

  it('performs request if there is stale data', async () => {
    const manager = createManagerWithMemoryCache();
    let calls = 0;
    const request = () =>
      new Promise(resolve => {
        calls++;
        resolve(calls);
      });

    manager.request(key1, request, { ttl: 50, staleTTL: 200, type: 'query' });
    await wait(5);
    let result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(1);
    await wait(100);
    // Should initiate a new request because data is stale
    result = manager.request(key1, request);
    expect(result).toBeDefined();
    expect(result.stale).toBe(true);
    await wait(5);
    // Should now have it updated to 2
    result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(2);
  });

  it('can perform pub/sub', async () => {
    const manager = createManagerWithMemoryCache();
    const request = (v: number) =>
      new Promise(resolve => {
        resolve(v);
      });
    manager.request(key1, request, undefined, 0);

    await wait(50);
    expect(manager.state(key1)).not.toBe(undefined);

    let result = 0;
    const resultSub = (state: { data?: number; pending?: boolean; error?: string }) => {
      result = state.data || 0;
    };
    manager.sub(key1, resultSub);
    manager.request(key1, request, undefined, 10);
    await wait(1);
    // This should be from cache still, because didn't provide forced
    // and didn't chaneg the key
    expect(result).toBe(0);
    // Now forced it to be not from cache
    manager.request(key1, request, { forced: true, type: 'query' }, 10);
    await wait(1);
    expect(result).toBe(10);

    manager.unsub(key1, resultSub);
    manager.request(key1, request, { forced: true, type: 'query' }, 20);
    await wait(1);
    // Since we unsubscribed, should remain 10
    expect(result).toBe(10);
  });

  it('can report errors', async () => {
    const manager = createManagerWithMemoryCache();
    const request = () =>
      new Promise(() => {
        throw new Error('The thing blew up');
      });

    let error: Error | undefined;
    const resultSub = (state: { data?: number; pending?: boolean; error?: any }) => {
      error = state.error;
    };

    manager.sub(key1, resultSub);
    manager.request(key1, request);
    await wait(50);
    expect(error).not.toBe(undefined);
  });

  it('can refetch', async () => {
    const manager = createManagerWithMemoryCache();
    let offset = 10;
    const request = () =>
      new Promise(resolve => {
        offset++;
        resolve(offset);
      });

    manager.request(key1, request);

    await wait(5);
    let result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(11);
    manager.refetchByKey(key1);
    await wait(5);
    result = manager.state(key1);
    expect(result).toBeDefined();
    expect(result && result.data).toBe(12);
  });

  it('can cancel', async () => {
    const manager = createManagerWithMemoryCache();
    let called = 0;
    const request = () =>
      new Promise(async resolve => {
        called++;
        if (called === 2) {
          // Make it slow
          await wait(100);
        }
        resolve(called);
      });

    // Can cancel delayed one
    manager.request(key1, request, { delay: 100, type: 'query' });
    await wait(5);
    manager.cancel(key1);
    // Wait now to make sure the requests didn't get called
    await wait(200);
    expect(manager.stats().pending).toBe(0);
    expect(called).toBe(0);
    let state = manager.state(key1);
    expect(state && state.data).toBeUndefined();

    // Can cancel a slow request, first let it finish and then
    // we can call a slow version
    manager.request(key1, request);
    await wait(5);
    state = manager.state(key1);
    expect(state && state.data).toBe(1);
    expect(called).toBe(1);

    manager.request(key2, request, { forced: true, type: 'query' });
    await wait(5);
    manager.cancel(key1);
    // Wait now to make sure the requests didn't get called
    await wait(200);
    state = manager.state(key1);
    expect(state && state.data).toBe(1);
    expect(called).toBe(2);
  });

  it('can provide stats', async () => {
    const manager = createManagerWithMemoryCache();
    const request = () =>
      new Promise(resolve => {
        resolve(10);
      });
    const slowRequest = () =>
      new Promise(async resolve => {
        await wait(500);
        resolve(10);
      });

    manager.request(key1, request);
    await wait(5);
    manager.request(key2, slowRequest);
    manager.request(key3, slowRequest, { delay: 100, type: 'query' });
    await wait(5);
    const stats = manager.stats();
    const cacheStats = manager.getCache().stats();
    expect(stats.requests).toBe(3);
    expect(stats.pending).toBe(2);
    expect(stats.fetching).toBe(1);
    expect(cacheStats.objects).toBe(1);
  });

  it('can notify correctly', async () => {
    const notifs: SubReason[] = [];
    const manager = createManagerWithMemoryCache({
      request: { retries: 1, retryDecay: () => 50, ttl: 200, staleTTL: 100, type: 'query' }
    }, {
      defaultGCInterval: 100
    });
    const onUpdate = (_: any, reason: SubReason) => {
      notifs.push(reason);
    };
    const onUpdateBroad = (key: string, _: any, reason: SubReason) => {
      notifs.push(reason);
    };

    manager.sub(key1, onUpdate);

    let failed = false;
    const request = () =>
      new Promise(resolve => {
        if (!failed) {
          failed = true;
          throw new Error(`Fail first time`);
        }
        resolve(10);
      });

    manager.request(key1, request);
    await wait(100);
    expect(notifs.length).toBe(5);
    expect(notifs[0].pending).toBe(true);
    expect(notifs[1].fetching).toBe(true);
    expect(!notifs[2].fetching && notifs[2].error).toBe(true);
    expect(notifs[3].fetching).toBe(true);
    expect(notifs[4].success).toBe(true);

    expect(manager.state(key1)?.data).toBe(10);
    manager.unsub(key1, onUpdate);
    manager.subBroadcast(onUpdateBroad);
    await wait(400);
    expect(notifs.length).toBe(6);
    // This one must come from a broadcast
    expect(notifs[5].expired).toBe(true);
    expect(manager.state(key1)?.data).toBeUndefined();
  });

  it('can retry', async () => {
    const manager = createManagerWithMemoryCache({
      request: { retries: 3, retryDecay: () => 50, type: 'query' }
    });
    let attempts = 0;

    const request = () =>
      new Promise(resolve => {
        attempts++;
        if (attempts < 3) {
          attempts++;
          throw new Error(`Fail until third attempt`);
        }
        resolve(10);
      });

    manager.request(key1, request);
    await wait(150);
    expect(attempts).toBe(3);
    const state = manager.state(key1);
    expect(state?.data).toBe(10);
  });

  it('can notify when updated or cleared from cache', async () => {
    let updated = false;
    let expired = false;
    const manager = createManagerWithMemoryCache();
    const onUpdate = (_: any, reason: SubReason) => {
      if (reason.manual) {
        updated = true;
      }
      if (reason.expired) {
        expired = true;
      }
    };

    manager.sub(key1, onUpdate);
    const request = () =>
      new Promise(resolve => {
        resolve(10);
      });

    manager.request(key1, request);
    await wait(5);
    let state = manager.state(key1);
    expect(updated).toBe(false);
    expect(state?.data).toBe(10);

    manager.updateCache(key1, 5);
    state = manager.state(key1);
    expect(updated).toBe(true);
    expect(state?.data).toBe(5);

    manager.clearCache(key1);
    state = manager.state(key1);
    expect(expired).toBe(true);
    expect(state?.data).toBeUndefined();
  });

  it('can convert on storage', async () => {
    const manager = createManagerWithMemoryCache();
    const request = () =>
      new Promise(resolve => {
        resolve({
          value: 5
        });
      });

    manager.request(key1, request, { storage: requestStorageJSON, type: 'query' });
    await wait(5);
    expect(manager.fromCache(key1)).toBe('{"value":5}');
    const state = manager.state<{ value: number }>(key1);
    const state2 = manager.state<{ value: number }>(key1);
    if (!state || !state2) {
      throw new Error(`Broken states`);
    }
    expect(state.data).toBeDefined();
    expect(state2.data).toBeDefined();
    if (!state.data || !state2.data) {
      throw new Error(`Expected values in state 1 and 2`);
    }
    expect(state.data).not.toBe(state2.data);
    expect(state.data.value).toBe(state2.data.value);

    state.data.value = 10;
    expect(state.data.value).not.toBe(state2.data.value);
  });

  it('can ignore same payload', async () => {
    const manager = createManagerWithMemoryCache();
    const request = () =>
      new Promise(resolve => {
        resolve({ value: 100 });
      });

    manager.request(key1, request, { type: 'query' });
    await wait(5);
    const cacheVal = manager.fromCache(key1);

    manager.request(key1, request, {
      forced: true,
      equalityCheck: (p, n) => JSON.stringify(p) === JSON.stringify(n),
      type: 'query'
    });
    await wait(5);
    expect(cacheVal).toBe(manager.fromCache(key1));
  });

  it('can extract payload', async () => {
    const manager = createManagerWithMemoryCache();
    const request = () =>
      new Promise<{ value: number }>(resolve => {
        resolve({
          value: 5
        });
      });

    manager.request(key1, request, { transform: (payload: { value: number }) => payload.value, type: 'query' });
    await wait(5);
    expect(manager.fromCache(key1)).toBe(5);
    const state = manager.state(key1);
    expect(state?.data).toBe(5);
  });

  it('can prioritize', async () => {
    const manager = createManagerWithMemoryCache({
      maxParallelRequests: 0
    });

    const results: number[] = [];
    const request5 = () =>
      new Promise(resolve => {
        results.push(5);
        resolve(5);
      });
    const request10 = () =>
      new Promise(resolve => {
        results.push(10);
        resolve(10);
      });
    const request20 = () =>
      new Promise(resolve => {
        results.push(20);
        resolve(20);
      });

    manager.request(key1, request5);
    manager.request(key2, request10, { priority: 10, type: 'query' });
    manager.request(key3, request20, { priority: 20, type: 'query' });
    manager.updateConfig({ maxParallelRequests: 1 });
    await wait(50);
    expect(results.length).toBe(3);
    expect(results[0]).toBe(20);
    expect(results[1]).toBe(10);
    expect(results[2]).toBe(5);
  });

  it('can delay request', async () => {
    const manager = createManagerWithMemoryCache();
    let called = false;
    const request = () =>
      new Promise(resolve => {
        called = true;
        resolve(10);
      });

    manager.request(key1, request, { delay: 100, type: 'query' });
    await wait(50);
    expect(called).toBe(false);
    expect(manager.stats().pending).toBe(1);
    expect(manager.stats().fetching).toBe(0);
    await wait(100);
    expect(called).toBe(true);
    expect(manager.state(key1)?.data).toBe(10);
  });

  it('can batch requests', async () => {
    const manager = createManagerWithMemoryCache();
    let called = 0;
    const api = (id: number | number[]) =>
      new Promise<number | number[]>(async resolve => {
        called++;
        resolve(Array.isArray(id) ? id.map(i => i + 1000) : id + 1000);
      });

    const tags = ['tag'];
    const batcher = (args: number[][]) => {
      // Collect all IDs, they are single ones, so we just take the
      // first element and convert to a list of IDs.
      // We know in this case it'll return an array, so we don't need
      // to re-convert.
      return api(args.map(a => a[0])) as Promise<number[]>;
    };
    manager.batch(tags, TagMatch.Any, batcher);
    manager.request('1', api, { type: 'query', delay: 5 }, 1);
    manager.request('2', api, { type: 'query', delay: 5, tags }, 2);
    manager.request('3', api, { type: 'query', delay: 5, tags }, 3);
    await wait(50);
    expect(called).toBe(2);
    expect(manager.state('1')?.data).toBe(1001);
    expect(manager.state('2')?.data).toBe(1002);
    expect(manager.state('3')?.data).toBe(1003);
  });
});
