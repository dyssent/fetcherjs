import { deepEqual } from '../utils';

describe('deepCompare', () => {
  it('should compare primitive values', () => {
    // Numbers
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    // Booleans
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
    // Strings
    expect(deepEqual('1', '1')).toBe(true);
    expect(deepEqual('1', '2')).toBe(false);
    // Null
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, '1')).toBe(false);
    // Undefined
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(undefined, null)).toBe(false);
  });

  it('should compare array values', () => {
    expect(deepEqual([1,2,3], [1,2,3])).toBe(true);
    expect(deepEqual([1,2,3], [1,3,2])).toBe(false);
    expect(deepEqual([1,2], [1,2,3])).toBe(false);
    expect(deepEqual([1,2,3], [1,2])).toBe(false);
    expect(deepEqual([1, true, 'string', null, undefined], [1, true, 'string', null, undefined])).toBe(true);
    expect(deepEqual([1, true, 'string', null, undefined], [2, true, 'string', null, undefined])).toBe(false);
  });

  it('should compare object values', () => {
    expect(deepEqual({a: 1}, {a: 1})).toBe(true);
    expect(deepEqual({a: 1}, {b: 1})).toBe(false);
    expect(deepEqual({a: 1, b: 2}, {a: 1, b: 2})).toBe(true);
    expect(deepEqual({b: 2, a: 1}, {a: 1, b: 2})).toBe(true);
  });

  it('should compare nested values', () => {
    expect(deepEqual([1,{a: 2, b: null, c: 'string'},3], [1,{a: 2, b: null, c: 'string'},3])).toBe(true);
    expect(deepEqual([1,{a: 2, b: {d: 1}, c: 'string'},3], [1,{a: 2, b: null, c: 'string'},3])).toBe(false);
  });

  it('should stop at provided depth', () => {
    expect(deepEqual([1,2,3], [1,2], 0)).toBe(true);
    expect(deepEqual([1,2,3], [1,2], 1)).toBe(false);
    expect(deepEqual([1,2,[3]], [1,2,[]], 1)).toBe(true);
    expect(deepEqual([1,2,[3]], [1,2,[]], 2)).toBe(false);

    expect(deepEqual({a: {b: {c: 'string'}}}, {a: {b: {c: 'string2'}}}, 0)).toBe(true);
    expect(deepEqual({a: {b: {c: 'string'}}}, {a: {b: {c: 'string2'}}}, 1)).toBe(true);
    expect(deepEqual({a: {b: {c: 'string'}}}, {a: {b: {c: 'string2'}}}, 2)).toBe(true);
    expect(deepEqual({a: {b: {c: 'string'}}}, {a: {b: {c: 'string2'}}}, 3)).toBe(false);
  });

  it('should compare functions correctly', () => {
    const a = () => {};
    const b = () => {};
    expect(deepEqual(a, a)).toBe(true);
    expect(deepEqual(a, b)).toBe(false);
    expect(deepEqual(a, () => {})).toBe(false);
    expect(deepEqual(() => {}, b)).toBe(false);
    expect(deepEqual(() => {}, () => {})).toBe(false);
  });

  it('should use strict mode if required', () => {
    const a1 = [1,2,3];
    const a2 = [1,2,3];
    expect(deepEqual(a1, a2)).toBe(true);
    expect(deepEqual(a1, a1, undefined, true)).toBe(true);
    expect(deepEqual(a1, a2, undefined, true)).toBe(false);

    const o1 = {a: 1, b: 2, c: 3};
    const o2 = {a: 1, b: 2, c: 3};
    expect(deepEqual(o1, o2)).toBe(true);
    expect(deepEqual(o1, o1, undefined, true)).toBe(true);
    expect(deepEqual(o1, o2, undefined, true)).toBe(false);
  });
});
