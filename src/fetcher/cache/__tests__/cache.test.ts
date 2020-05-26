import { clear } from 'jest-date-mock';

import { createMemoryCache, MemoryCacheJSON } from '../memory';
import { CacheChange } from '../cache';
import { TagMatch } from '../tag';
import { wait } from '../testUtils';

describe('query-memory-cache', () => {
  const testKey = 'test-key';
  const testKey2 = 'test-key2';
  const testKey3 = 'test-key3';
  const testKey4 = 'test-key4';
  const testValue = 'test-value';
  const testValue2 = 'test-value2';
  const testValue3 = 'test-value3';

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    clear();
    jest.useRealTimers();
  });

  it('can store and retrieve values', () => {
    const cache = createMemoryCache();

    cache.set(testKey, testValue);
    expect(cache.get(testKey)).toBe(testValue);
    cache.set(testKey2, testValue2);
    expect(cache.get(testKey2)).toBe(testValue2);

    cache.set(testKey, testValue2);
    expect(cache.get(testKey)).toBe(testValue2);

    cache.clear(testKey2);
    expect(cache.has(testKey)).toBe(true);
    expect(cache.has(testKey2)).toBe(false);
    expect(cache.has(testKey3)).toBe(false);
  });

  it('can find and clear by tags', () => {
    const cache = createMemoryCache();

    cache.set(testKey, testValue, undefined, undefined, undefined, ['a']);
    cache.set(testKey2, testValue, undefined, undefined, undefined, ['a', 'b']);
    cache.set(testKey3, testValue, undefined, undefined, undefined, ['a', 'b', '3']);
    cache.set(testKey4, testValue, undefined, undefined, undefined, ['a', 'b', '3']);
    expect(cache.findByTags('a', TagMatch.Any).length).toBe(4);
    expect(cache.findByTags('a', TagMatch.None).length).toBe(0);
    expect(cache.findByTags(['a', 'b'], TagMatch.All).length).toBe(3);
    expect(cache.findByTags(['a', 'b'], TagMatch.Any).length).toBe(4);
    expect(cache.findByTags(['a', 'b'], TagMatch.None).length).toBe(0);
    expect(cache.findByTags('3', TagMatch.None).length).toBe(2);
    expect(cache.findByTags('a', TagMatch.All, t => t !== testKey4).length).toBe(3);
  });

  it('can collect expired records and retain non-expirable', async () => {
    const cache = createMemoryCache({
      defaultTTL: 500,
      defaultStaleTTL: -1,
      defaultGCInterval: 500
    });
    cache.set(testKey, testValue);
    cache.set(testKey2, testValue2, 1000);
    cache.set(testKey3, testValue3, -1);
    await wait(600);
    expect(cache.has(testKey)).toBe(false);
    expect(cache.has(testKey2)).toBe(true);
    expect(cache.get(testKey2)).toBe(testValue2);
    await wait(600);
    expect(cache.has(testKey2)).toBe(false);
    expect(cache.gc().awaiting).toBe(0);

    cache.set(testKey, testValue, 100);
    let collected = cache.gc();
    expect(collected.awaiting).toBe(1);
    expect(collected.cleaned).toBe(0);
    await wait(200);
    collected = cache.gc();
    expect(collected.cleaned).toBe(1);
    expect(collected.awaiting).toBe(0);
    expect(cache.has(testKey)).toBe(false);
    expect(cache.has(testKey3)).toBe(true);
    expect(cache.get(testKey3)).toBe(testValue3);
  });

  it('can collect expired entries', async () => {
    const cache = createMemoryCache({
      defaultTTL: 500,
      defaultStaleTTL: -1,
      defaultGCInterval: 50
    });
    cache.set(testKey, testValue, 300, 200);
    cache.set(testKey2, testValue2, 100);
    cache.lock(testKey);
    cache.lock(testKey2);
    await wait(50);
    expect(cache.get(testKey)).toBe(testValue);
    expect(cache.get(testKey2)).toBe(testValue2);
    await wait(60);
    expect(cache.getState(testKey)?.stale).toBe(undefined);
    expect(cache.getState(testKey2)?.stale).toBe(undefined);
    cache.unlock(testKey2);
    await wait(200);
    expect(cache.getState(testKey)?.stale).toBe(true);
    expect(cache.has(testKey)).toBe(true);
    expect(cache.has(testKey2)).toBe(false);
    cache.unlock(testKey);
    await wait(500);
    expect(cache.has(testKey)).toBe(false);
  });

  it('can detect stale entries', async () => {
    const cache = createMemoryCache({
      defaultTTL: 500,
      defaultStaleTTL: -1,
      defaultGCInterval: 50
    });
    cache.set(testKey, testValue, 200, 200);
    await wait(50);
    expect(cache.get(testKey)).toBe(testValue);
    expect(cache.getState(testKey)?.stale).toBeFalsy();
    await wait(200);
    expect(cache.getState(testKey)?.stale).toBe(true);
    await wait(200);
    expect(cache.has(testKey)).toBe(false);
  });

  it('can do update, and expire pub / sub', async () => {
    const cache = createMemoryCache({
      defaultTTL: 500,
      defaultStaleTTL: -1,
      defaultGCInterval: 500
    });
    let sub1Value: string = 'initial';
    let sub2Value: string = 'initial';
    const changes: CacheChange[] = [];

    const sub1 = (key: string, val: string) => {
      sub1Value = val;
    };
    const sub2 = (key: string, val: string, change: CacheChange) => {
      sub2Value = val;
      changes.push(change);
    };

    cache.lock(testKey);
    cache.sub(sub1);
    cache.sub(sub2);

    cache.set(testKey, testValue, 1);
    cache.lock(testKey);
    await wait(100);
    // Should not expire while locked
    expect(cache.get(testKey)).toBe(testValue);
    expect(sub1Value).toBe(testValue);
    expect(sub2Value).toBe(testValue);

    // Remove sub2 and check if only sub1 gets the value
    cache.unsub(sub1);
    cache.set(testKey, testValue2, 1);
    expect(sub1Value).toBe(testValue);
    expect(sub2Value).toBe(testValue2);

    cache.unlock(testKey);
    await wait(100);
    const collected = cache.gc();
    expect(collected.cleaned).toBe(1);
    expect(collected.awaiting).toBe(0);
    expect(cache.has(testKey)).toBe(false);
    expect(changes.length).toBe(3);
    expect(changes[0]).toBe(CacheChange.Update);
    expect(changes[1]).toBe(CacheChange.Update);
    expect(changes[2]).toBe(CacheChange.Expire);
  });

  it('can do clear pub / sub', async () => {
    const cache = createMemoryCache();

    let r: CacheChange | undefined;
    const sub1 = (key: string, val: string, reason: CacheChange) => (r = reason);

    cache.set(testKey, testValue, 1);
    cache.sub(sub1);
    cache.clear(testKey);
    expect(r).toBe(CacheChange.Clear);
  });

  it('can save if storage is provided', async () => {
    let data: MemoryCacheJSON | undefined;
    const cache = createMemoryCache({
      storage: {
        save: value => data = value,
        matchers: []
      }
    });

    cache.set(testKey, testValue);
    cache.set(testKey2, testValue2);
    cache.save();

    expect(data).toBeDefined();
    expect(data?.records[testKey]?.value).toBe(testValue);
    expect(data?.records[testKey2]?.value).toBe(testValue2);
  });

  it('can rehydrate and return a rehydrated value', async () => {
    let data: MemoryCacheJSON | undefined;
    const cache = createMemoryCache({
      storage: {
        save: value => data = value,
        matchers: []
      }
    });

    const tag1 = 'tag1';
    const tag2 = 'tag2';
    cache.set(testKey, testValue, undefined, undefined, undefined, tag1);
    cache.set(testKey2, testValue2, undefined, undefined, undefined, [tag1, tag2]);
    cache.save();

    const cache2 = createMemoryCache({}, data);
    const tag1Keys = cache2.findByTags(tag1, TagMatch.All);
    expect(tag1Keys.length).toBe(2);
    expect(tag1Keys.indexOf(testKey) >= 0).toBe(true);
    expect(tag1Keys.indexOf(testKey2) >= 0).toBe(true);

    const tag2Keys = cache2.findByTags(tag2, TagMatch.All);
    expect(tag2Keys.length).toBe(1);
    expect(tag2Keys.indexOf(testKey2) >= 0).toBe(true);

    expect(cache2.get(testKey)).toBe(testValue);
    expect(cache2.get(testKey2)).toBe(testValue2);
  });
});
