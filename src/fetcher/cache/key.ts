export type CacheKeyPrimitiveType = string | number | boolean | null | undefined;
export type CacheKeyType = CacheKeyPrimitiveType | { [key: string]: CacheKeyType } | CacheKeyType[];
export type CacheKeyParam = CacheKeyType | (() => CacheKeyType);
export type CacheKeyFunc = (value: CacheKeyType) => string | number;

export function cacheKey(key: CacheKeyType): string {
  switch (typeof key) {
    case 'boolean':
      return key ? 'true' : 'false';
    case 'number':
      return key.toString(10);
    case 'string':
      return key;
    case 'undefined':
      return '';
    case 'object':
      if (key === null) {
        return 'null';
      }

      if (Array.isArray(key)) {
        return `[${key.map(k => cacheKey(k)).join(',')}]`;
      }

      const objContent = Object.keys(key)
        .sort()
        .map(k => {
          const v = key[k];
          if (typeof v === 'undefined') {
            return undefined;
          }
          return `${k}=${cacheKey(v)}`;
        })
        .filter(v => typeof v !== 'undefined')
        .join(',');

      return `{${objContent}}`;

    default:
      throw new Error(`Unexpected key type: ${typeof key}`);
  }
}

// Java hash implementation
// const hashCode = (s: string) => s
//   .split('')
//   .reduce((a, b) => {
//     // tslint:disable:no-bitwise
//     a = ((a << 5) - a) + b.charCodeAt(0);
//     return a & a;
//     // tslint:enable:no-bitwise
// }, 0);

// cyrb53
const hashCode = (str: string, seed = 0) => {
  // tslint:disable:no-bitwise
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  // tslint:enable:no-bitwise
};

export function cacheKeyHash(key: CacheKeyType): string {
  return hashCode(cacheKey(key)).toString(10);
}

export function computeCacheKey(key: CacheKeyParam, func: CacheKeyFunc): string | undefined {
  let k: CacheKeyType;
  if (typeof key === 'function') {
    try {
      k = key();
    } catch {
      return undefined;
    }
  } else {
    k = key;
  }
  if (k === false || k === null || typeof k === 'undefined') {
    return undefined;
  }
  const res = func(k);
  return typeof res === 'number' ? res.toString(10) : res;
}
