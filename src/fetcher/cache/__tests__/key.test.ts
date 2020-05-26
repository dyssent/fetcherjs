import { cacheKey, cacheKeyHash, computeCacheKey } from '../key';

describe('query-cache-key', () => {
  it('can hash simple values', () => {
    const key1 = cacheKey('key1');
    const key2 = cacheKey('key2');
    expect(key1).not.toBe(key2);

    const hash1 = cacheKeyHash('key1');
    const hash2 = cacheKeyHash('key2');
    expect(hash1).not.toBe(hash2);

    // Must be deterministic
    expect(cacheKey('key1')).toBe(cacheKey('key1'));
    expect(cacheKeyHash('key1')).toBe(cacheKeyHash('key1'));
  });

  it('can hash arrays', () => {
    const key1 = cacheKey([1, 2, 'str']);
    const key2 = cacheKey([1, 2, 'str']);
    expect(key1).toBe(key2);
  });

  it('can hash objects', () => {
    const key1 = cacheKey({
      a: 1,
      b: 2
    });
    const key2 = cacheKey({
      a: 1,
      b: 2
    });
    expect(key1).toBe(key2);

    // Deterministic
    const key3 = cacheKey({
      b: 2,
      a: 1,
      c: undefined
    });
    expect(key1).toBe(key3);
  });

  it('can hash via function', () => {
    const key1 = cacheKey(computeCacheKey(() => [1, 2, 'str'], cacheKeyHash));
    const key2 = cacheKey(computeCacheKey(() => [1, 2, 'str'], cacheKeyHash));
    expect(key1).toBe(key2);

    const keyBroken = computeCacheKey(() => {
      throw new Error('Bad function');
    }, cacheKeyHash);
    expect(keyBroken).toBe(undefined);
  });

  it('can hash nested', () => {
    const obj = [
      true,
      10,
      'Some String',
      undefined,
      {
        key1: 'Values',
        key2: 'Value2',
        key3: undefined,
        key4: {
          a: 1,
          b: 'bstr'
        },
        key5: null
      }
    ];

    const key1 = cacheKey(obj);
    const key2 = cacheKey(obj);
    expect(key1).toBe(key2);
  });
});
