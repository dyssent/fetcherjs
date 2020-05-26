import { Cache, CacheConfig, createMemoryCache, CacheStats, TagMatch, Tag, CacheChange } from '../cache';

import {
  Request,
  RequestState,
  RequestOptions,
  requestStorageDirect,
  defaultRetryDecay,
  RequestOptionsStorage,
  RequestQueryOptions
} from './request';

/**
 * SubReason provides guidance into what changed in the
 * state and the reason for it.
 */
export interface SubReason {
  pending?: boolean;
  fetching?: boolean;
  error?: boolean;
  success?: boolean;
  manual?: boolean;
  expired?: boolean;
}

/**
 * ManagerSubCallback is a function type to be called each
 * time there is an update to the request state.
 */
export type ManagerSubCallback<T, E, U> = (state: RequestState<T, E>, reason: SubReason, userData?: U) => void;

/**
 * ManagerBroadcast is a function type to be called each
 * time there is any update to any request. This is somewhat of a broadcast listener
 * for all ongoing activity in a manager.
 */
export type ManagerBroadcast<T, E, U> = (key: string, state: RequestState<T, E>, reason: SubReason, userData?: U) => void;

export interface ManagerConfig<CC extends CacheConfig = CacheConfig> {
  /**
   * debug enables some extra information to be logged
   * while the manager operates.
   */
  debug?: boolean;
  /**
   * cache configuration to be provided a cache on creation.
   */
  cache?: Partial<CC>;
  /**
   * request default configuration if needed.
   */
  request?: RequestQueryOptions<any>;
  /**
   * hooks provides a set of interception points, in case logic
   * has to be modified before processing
   */
  hooks?: {
    /**
     * Called each time update notification is about to be delivered to the subscribers. If provided, must return true
     * if it is okay to deliver the message, or false if nothing else has to be done by the manager.
     */
    onNotifySub?: <T, E, U>(subscriber: ManagerSubCallback<T, E, U>, state: RequestState<T, E>, reason: SubReason, userData?: U) => boolean;
    /**
     * Called each time broadcast notification is about to be delivered. If provided, must return true
     * if it is okay to deliver the message, or false if nothing else has to be done by the manager.
     */
    onNotifyBroad?: <T, E, U>(subscriber: ManagerBroadcast<T, E, U>, key: string, state: RequestState<T, E>, reason: SubReason, userData?: U) => boolean;
  };
  /**
   * maxParallelRequests limits the amount of requests that
   * can be performed in parallel. Negative value will have
   * unlimited capacity.
   */
  maxParallelRequests: number;
}

export const defaultManagerConfig: ManagerConfig = {
  maxParallelRequests: -1
};

/**
 * ManagerStats has basic stats on the current state of the manager.
 */
export interface ManagerStats {
  /**
   * Number of requests being fetched.
   */
  fetching: number;
  /**
   * Number of requests being fetched or pending.
   */
  pending: number;
  /**
   * Number of requests stored in the cache.
   */
  requests: number;
}

export interface Manager<C extends Cache = Cache> {
  /**
   * request starts a promise request, if there is data already in the cache, it'll
   * immediately return the data and provide no further updates. If forced is set in
   * options, it will in addition to possible cached value, schedule an actual request
   * to take place. If options are not provided, the request will be treated as a query.
   * There is an important distinction between a query and a mutation request.
   * Mutations:
   * - ignore cache and never store values there.
   * - refetch and refetchByTags don't work on mutations, as mutation key is removed as soon as
   *   it is finished or cancelled.
   * - cache methods (from, update, clear) will have no effect as value is not stored there.
   * - mutations get priority over queries, but within mutations themselves priority is still
   *   used for sorting.
   */
  request: <T, RT = T, ST = unknown, E = Error, ARGS extends unknown[] = unknown[]>(
    key: string,
    r: (...args: ARGS) => Promise<RT>,
    options?: RequestOptions<T, RT, ST, E>,
    ...args: ARGS
  ) => RequestState<T, E>;
  /**
   * refetchByKey schedules a new fetch using the past requests keys. If key is not found, it'll
   * return false, otherwise true.
   */
  refetchByKey: (key: string) => boolean;
  /**
   * refetchByTags initiates a new fetch for each request that matches the tags. Default match
   * is TagMatch.Any
   */
  refetchByTags: (tags: Tag | Tag[], match?: TagMatch, check?: (key: string) => boolean) => number;
  /**
   * cancel if request is not longer relevant, you can manually cancel it, which will trigger
   * a cancel sequence of events, and stop updates issuing. It is important that the state
   * of the query might remain in erroneous state if there was an error previously.
   */
  cancel: (key: string) => boolean;

  /**
   * Registers a batcher which can bundle together requests with different keys so that they can
   * be effectively requested in a single request. Since keys are always unique, batcher operates
   * on tags and effectively picks up all requests which match the tags. It is user's responsibility
   * to make sure those tags are unique and request signature is consistent. If some requests in the pending
   * queue are still due for a retry due to a previous error, they will be also bundled together, so that retry
   * operations get synchronous for all entities that match the batcher.
   *
   * Example: instead of sending multiple
   * single user information request, which could be the case with various components requiring
   * information about the user they need locally, all of them can be bundled together within a certain
   * time frame and requested in a single call with an array of user IDs provided. Once finished, it
   * resolves all of the requests at once. delay parameter in the request plays an important role in this,
   * as it will give some time for requests to buffer up in the pending queue, and then they can be
   * all immediately placed into fetching state by the batcher.
   *
   * batcher is a function that will be called instead of the other multiple requests, once resolved, its
   * results will be fed back into multiple requests that got bundled so they can be processed for equality,
   * storage, and so on. args provided is an array of arguments that were originally provided to requests.
   * They DO include both static arguments and dynamic arguments.
   * Individual requests in a batch can't be cancelled, as there is no real request going on for each
   * request, even though their state changes to fetching.
   *
   * If there is only one request found that matches the batcher, it will run as an independent request and
   * not in batch mode. Resulting order must match the requested one. E.g. if ids were in this order: 1,2,3
   * then the results should be [result for id 1, result for id 2, result for id 3]
   */
  batch: <T, AT extends unknown[] = unknown[], RT = T, E = Error>(
    tags: Tag | Tag[],
    match: TagMatch,
    batcher: BatcherFunc<T, AT, RT, E>,
    maxBatchSize?: number
  ) => () => void;
  unbatch: (tags: Tag | Tag[], match: TagMatch) => void;

  /**
   * state returns a state for a key. If no such state exists for the key, undefined will be returned.
   */
  state: <T, E = Error>(key: string) => RequestState<T, E> | undefined;
  /**
   * sub subscribes to the updates on a particular key, and returns an unsubsribe function
   * which can be handy.
   */
  sub: <T, E, U>(key: string, on: ManagerSubCallback<T, E, U>, userData?: U) => () => void;
  /**
   * unsub unsubscribes a listener from the key updates
   */
  unsub: <T, E, U>(key: string, on: ManagerSubCallback<T, E, U>) => void;
  /**
   * subBroadcast subscribes to a stream of all updates from all requests
   */
  subBroadcast: <T, E, U>(on: ManagerBroadcast<T, E, U>, userData?: U) => () => void;
  /**
   * unsubBroadcast unsubscribes a listener from the stream of all updates
   */
  unsubBroadcast: <T, E, U>(on: ManagerBroadcast<T, E, U>) => void;

  /**
   * fromCache pulls a value from the cache via a key, in its raw format. It does not perform
   * storage transformations
   */
  fromCache: <T>(key: string) => T | undefined;
  /**
   * updateCache replaces a value in the cache with a new value, if there are subscribers to this
   * cache value, it'll trigger notifications
   */
  updateCache: <T>(key: string, value: T, ttl?: number, staleTTL?: number) => void;
  /**
   * clearCache removes a value from a cache. If value is not present, it'll return false.
   */
  clearCache: (key: string) => boolean;
  /**
   * clearCacheByTags removes all cache values that were tagged with the provided tags.
   * match by default is TagMatch.All
   */
  clearCacheByTags: (tags: Tag | Tag[], match?: TagMatch, check?: (key: string) => boolean) => number;

  /**
   * getCache returns the cache that is used by the manager. Normally this should not be used.
   */
  getCache: () => C;
  /**
   * getStats returns some debugging statistics
   */
  stats: () => ManagerStats;
  /**
   * updateConfig updates a configuration used by the manager. This must be used very carefully,
   * as ongoing requests won't be affected by a change immediately.
   */
  updateConfig: (config: Partial<Omit<ManagerConfig, 'cache'>>) => void;
}

export type BatcherResultRecord<T, E> =
  | {
      data?: never;
      error: E;
    }
  | {
      error?: never;
      data: T;
    };

export interface BatcherResultExtracted<T, E> {
  shape: 'extracted';
  data: BatcherResultRecord<T, E>[];
}

export interface BatcherResultDirect<RT, E> {
  shape: 'direct';
  data: BatcherResultRecord<RT, E>[];
}

export type BatcherResult<T, RT, E> = RT[] | BatcherResultExtracted<T, E> | BatcherResultDirect<RT, E>;

export type BatcherFunc<T, AT extends unknown[] = unknown[], RT = T, E = Error> = (
  args: AT[]
) => Promise<BatcherResult<T, RT, E>>;

interface Batcher<T> {
  tags: Tag[];
  match: TagMatch;
  batcher: BatcherFunc<T>;
  maxBatchSize?: number;
}

export function tagsMatch(requestTags: Tag[] | undefined, tags: Tag[], match: TagMatch): boolean {
  if (!requestTags) {
    return false;
  }

  switch (match) {
    case TagMatch.All:
      return (
        requestTags.length === tags.length &&
        tags.filter(t => requestTags.indexOf(t) >= 0).length === requestTags.length
      );

    case TagMatch.Any:
      return tags.findIndex(t => requestTags.indexOf(t) >= 0) >= 0 ? true : false;

    case TagMatch.None:
      return tags.findIndex(t => requestTags.indexOf(t) >= 0) >= 0 ? false : true;
  }
}

export function createManager(config: Partial<ManagerConfig> = {}): Manager {
  const cfg = {
    ...defaultManagerConfig,
    ...config
  };

  function updateConfig(c: Partial<Omit<ManagerConfig, 'cache'>>): void {
    if (typeof c.debug !== 'undefined') {
      cfg.debug = c.debug;
    }
    if (typeof c.request !== 'undefined') {
      cfg.request = c.request;
    }
    if (typeof c.maxParallelRequests !== 'undefined') {
      cfg.maxParallelRequests = c.maxParallelRequests;
      pushQueue();
    }
    if (typeof c.hooks !== 'undefined') {
      if (typeof c.hooks.onNotifySub !== 'undefined') {
        cfg.hooks = cfg.hooks ? {
          ...cfg.hooks,
          onNotifySub: c.hooks.onNotifySub
        } : {
          onNotifySub: c.hooks.onNotifySub
        };
      }
      if (typeof c.hooks.onNotifyBroad !== 'undefined') {
        cfg.hooks = cfg.hooks ? {
          ...cfg.hooks,
          onNotifyBroad: c.hooks.onNotifyBroad
        } : {
          onNotifyBroad: c.hooks.onNotifyBroad
        };
      }
    }
  }

  // Cache to store results of the requests
  const cache = createMemoryCache(cfg.cache);
  // List of requests currently being fetched
  const fetching: string[] = [];
  // List of requests that need to be fetched
  const pending: string[] = [];
  // Batches start multiple requests, so even though
  // technically it is a single request, it still will
  // count every one from the batch as an ongoing request.
  // To compensate for this batchAdjuster gets incremented
  // each time a batch is started for the amount of items in
  // a batch.
  let batchAdjuster = 0;
  // Database of requests, we only keep those here while
  // there is a subscriber to the key. If there is none,
  // we remove from here, while still may be present in
  // cache
  const requests: Record<string, Request<unknown>> = {};
  const batchers: Batcher<unknown>[] = [];
  const subs: Record<string, {cb: ManagerSubCallback<unknown, unknown, unknown>, userData?: unknown}[]> = {};
  const subsBroad: {cb: ManagerBroadcast<unknown, unknown, unknown>, userData?: unknown}[] = [];
  let scheduledPush: any;
  // Subscribe for expirationso we can monitor this always
  cache.sub(onCacheChange);

  function addRequest<T, RT, ST, E, ARGS extends unknown[]>(key: string, req: Request<T, RT, ST, E, ARGS>, initiate: boolean) {
    requests[key] = (req as unknown) as Request<unknown>;
    if (cfg.debug) {
      if (pending.indexOf(key) >= 0 || fetching.indexOf(key) >= 0) {
        throw new Error(`There is already a request with key '${key}' pending`);
      }
    }

    if (initiate) {
      addPending(key);
      pushQueue();
    }
  }

  function findBatcher(key: string, req: Request<unknown>) {
    if (req.options.type !== 'query') {
      return undefined;
    }

    const requestTags = req.options.tags || [];

    const b = batchers.find(batcher => tagsMatch(requestTags, batcher.tags, batcher.match));
    if (!b) {
      return undefined;
    }

    // We have a batcher which matches the request, now let's check if there are more requests
    // in the pending queue, but not fetching yet.
    const requestsWaiting = pending.filter(p => fetching.indexOf(p) < 0 && p !== key);
    if (requestsWaiting.length === 0) {
      return undefined;
    }

    let matching: string[] = requestsWaiting
      .map(r => {
        const rr = requests[r];
        if (rr.options.type !== 'query' || !tagsMatch(rr.options.tags, b.tags, b.match)) {
          return undefined;
        }
        return r;
      })
      .filter(m => m) as string[];
    if (matching.length === 0) {
      return undefined;
    }

    if (typeof b.maxBatchSize !== 'undefined' && b.maxBatchSize > 0 && matching.length > b.maxBatchSize) {
      matching = matching.slice(0, b.maxBatchSize);
    }

    return {
      batcher: b.batcher,
      matching: [key, ...matching]
    };
  }

  function finishRequestWithSuccess(key: string, req: Request<unknown>, result: unknown, extracted?: boolean) {
    let rs: RequestState<unknown> | undefined;
    removeFetching(key, false);
    removePending(key, false);

    const extract =
      typeof req.options.transform === 'function' ? req.options.transform : cfg.request && cfg.request.transform;

    const payload = extract && !extracted ? extract(result) : result;

    if (req.options.type === 'query') {
      const equalityCheck =
        typeof req.options.equalityCheck === 'function'
          ? req.options.equalityCheck
          : cfg.request && cfg.request.equalityCheck;
      const storage = req.options.storage ? req.options.storage : cfg.request && cfg.request.storage;

      let isPayloadDifferent = true;
      if (equalityCheck) {
        const cachedValue = cache.get(key);
        if (typeof cachedValue !== 'undefined') {
          isPayloadDifferent = !equalityCheck(unpackValue(cachedValue, storage), payload);
        }
      }

      if (isPayloadDifferent) {
        const ttl = typeof req.options.ttl !== 'undefined' ? req.options.ttl : cfg.request && cfg.request.ttl;
        const staleTTL =
          typeof req.options.staleTTL !== 'undefined' ? req.options.staleTTL : cfg.request && cfg.request.staleTTL;
        cache.set(key, packValue(payload, storage), ttl, staleTTL, true, req.options.tags);
      }
    } else {
      rs = {
        pending: false,
        fetching: false,
        data: payload
      };
      removeRequest(key);
    }
    notifySubs(key, { fetching: false, pending: false, success: true }, rs);
  }

  function finishRequestWithError(key: string, req: Request<unknown>, error: any) {
    let rs: RequestState<unknown> | undefined;
    req.attempts++;
    req.error = error;
    const retries =
      typeof req.options.retries !== 'undefined'
        ? req.options.retries
        : cfg.request && typeof cfg.request.retries !== 'undefined'
        ? cfg.request.retries
        : 0;

    let shouldRetry = retries === true || retries >= req.attempts;
    let retryAt: number = Date.now();
    if (shouldRetry) {
      // Let's try to find out when we can retry
      const retryDecay =
        typeof req.options.retryDecay !== 'undefined'
          ? req.options.retryDecay
          : cfg.request && typeof cfg.request.retryDecay !== 'undefined'
          ? cfg.request.retryDecay
          : defaultRetryDecay;

      const retryStatus = typeof retryDecay === 'function' ? retryDecay(req.attempts, error) : retryDecay;
      if (retryStatus === false) {
        shouldRetry = false;
      } else {
        retryAt += retryStatus;
      }
    }

    if (!shouldRetry) {
      removeFetching(key, false);
      removePending(key, false);
      if (req.options.type === 'mutation') {
        rs = {
          pending: false,
          fetching: false,
          error
        };
        removeRequest(key);
      }
      notifySubs(key, { fetching: false, pending: false, error: true }, rs);
    } else {
      req.nextAttempt = retryAt;
      removeFetching(key, false);
      notifySubs(key, { fetching: false, error: true });
    }
  }

  async function runBatchedRequest(keys: string[], batcher: BatcherFunc<unknown>) {
    if (keys.length === 0) {
      if (cfg.debug) {
        throw new Error('Tried to run a batched request with zero keys provided');
      }
      pushQueue();
      return;
    }

    const reqs = keys.map(k => ({ req: requests[k], key: k }));
    const validreqs = reqs.filter(k => k.req).length;
    if (validreqs !== keys.length) {
      const missing = reqs
        .filter(k => !k.req)
        .map(k => k.key)
        .join(', ');
      throw new Error(`Missing requests for keys: ${missing} in a batched request`);
    }

    try {
      const res = await batcher(reqs.map(r => r.req.args));
      const results: BatcherResultExtracted<unknown, unknown> | BatcherResultDirect<unknown, unknown> = Array.isArray(
        res
      )
        ? {
            shape: 'direct',
            data: res.map(r => ({ data: r, error: undefined }))
          }
        : res;

      if (results.data.length !== reqs.length) {
        throw new Error(
          `Batcher returned different (${results.data.length}) number of results than was requested ${reqs.length}`
        );
      }

      const extracted = results.shape === 'extracted';

      for (let i = 0; i < results.data.length; i++) {
        const r = reqs[i];
        const rd = results.data[i];

        if (typeof rd.data !== 'undefined') {
          finishRequestWithSuccess(r.key, r.req, rd.data, extracted);
        } else {
          // Must be an error then
          if (typeof rd.error === 'undefined') {
            throw new Error('Neither error nor data was provided for a batch result entry');
          }
          finishRequestWithError(r.key, r.req, rd.error);
        }
      }
    } catch (err) {
      reqs.forEach(r => finishRequestWithError(r.key, r.req, err));
    }
    batchAdjuster -= keys.length - 1;
    pushQueue();
  }

  async function runSingleRequest(key: string) {
    const req = requests[key];
    if (!req) {
      if (cfg.debug) {
        throw new Error(`Tried to run a request which doesn't exist. Key: '${key}'`);
      }
      pushQueue();
      return;
    }

    let cancelled = false;
    try {
      req.cancel = undefined;
      const promise = req.r(...req.args);
      req.cancel = () => {
        cancelled = true;
        if (promise.cancel) {
          promise.cancel();
        }
      };

      const result = await promise;
      if (cancelled) {
        return;
      }

      const validate =
        typeof req.options.validate === 'function' ? req.options.validate : cfg.request && cfg.request.validate;
      const maybeError = validate && validate(result);
      if (typeof maybeError !== 'undefined') {
        finishRequestWithError(key, req, maybeError);
      } else {
        finishRequestWithSuccess(key, req, result);
      }
    } catch (err) {
      if (cancelled) {
        return;
      }
      finishRequestWithError(key, req, err);
    }

    pushQueue();
  }

  function pushQueue() {
    if (typeof scheduledPush !== 'undefined') {
      clearTimeout(scheduledPush);
    }

    const queueFull = () => cfg.maxParallelRequests >= 0 && fetching.length - batchAdjuster >= cfg.maxParallelRequests;
    if (queueFull()) {
      return;
    }

    const now = Date.now();
    let nextScheduledPush = -1;
    for (const p of pending) {
      if (isFetching(p)) {
        continue;
      }

      const pr = requests[p];
      if (typeof pr.nextAttempt !== 'undefined' && pr.nextAttempt > now) {
        nextScheduledPush = nextScheduledPush === -1 ? pr.nextAttempt : Math.min(nextScheduledPush, pr.nextAttempt);
        continue;
      }

      // We found a request ready for fetching, lt's see if we can collect
      // a batch for it. If not - then we'll run it as usual.
      const b = findBatcher(p, pr);
      if (b) {
        batchAdjuster += b.matching.length - 1;
        addFetching(b.matching);
        runBatchedRequest(b.matching, b.batcher);
      } else {
        addFetching(p);
        runSingleRequest(p);
      }

      if (queueFull()) {
        break;
      }
    }

    // Schedule only if the queue is not full
    if (!queueFull() && nextScheduledPush >= 0) {
      scheduledPush = setTimeout(() => {
        scheduledPush = undefined;
        pushQueue();
      }, nextScheduledPush - now);
    }
  }

  function stats(): ManagerStats {
    return {
      fetching: fetching.length,
      pending: pending.length,
      requests: Object.keys(requests).length
    };
  }

  function getCache() {
    return cache;
  }

  function fromCache<T>(key: string): T | undefined {
    return cache.get(key);
  }

  function updateCache<T>(key: string, value: T, ttl?: number, staleTTL?: number): void {
    cache.set(key, value, ttl, staleTTL);
  }

  function clearCache(key: string): boolean {
    return cache.clear(key);
  }

  function clearCacheByTags(
    tags: Tag | Tag[],
    match: TagMatch = TagMatch.All,
    check?: (key: string) => boolean
  ): number {
    return cache.clearByTags(tags, match, check);
  }

  function notifySubs<T = unknown>(key: string, reason: SubReason, withState?: RequestState<T>) {
    if (cfg.debug) {
      console.trace(`Request manager notification: key(${key}), reason(${JSON.stringify(reason)})`);
    }

    const listeners = subs[key];
    if (!listeners && subsBroad.length === 0) {
      return;
    }

    const s = withState || state(key);
    if (!s) {
      if (cfg.debug) {
        throw new Error(`Trying to notify for a state which doesn't exist: ${key}. Reason: ${reason}`);
      }
      return;
    }

    const subHook = cfg.hooks && cfg.hooks.onNotifySub;
    const broadHook = cfg.hooks && cfg.hooks.onNotifyBroad;

    if (listeners) {
      // Make a slice, in case any of the callbacks will modify in any way
      // the listeners array, and we want to keep it stable.
      const stable = listeners.slice();
      for (const l of stable) {
        try {
          if (subHook && !subHook(l.cb, s, reason, l.userData)) {
            return;
          }

          l.cb(s, reason, l.userData);
        } catch {
          console.warn(`Subscriber notification failed for key: ${key}`, s, reason);
        }
      }
    }

    subsBroad.forEach(l => {
      try {
        if (broadHook && !broadHook(l.cb, key, s, reason, l.userData)) {
          return;
        }

        l.cb(key, s, reason, l.userData);
      } catch {
        console.warn(`Broadcast subscriber notification failed for key: ${key}`, s, reason);
      }
    });
  }

  function isPending(key: string) {
    return pending.indexOf(key) >= 0;
  }

  function isFetching(key: string) {
    return fetching.indexOf(key) >= 0;
  }

  function addPending(key: string, notify: boolean = true) {
    if (cfg.debug) {
      if (pending.indexOf(key) >= 0) {
        throw new Error(`There is already a pending key: ${key}`);
      }
    }
    pending.push(key);

    // Let's sort our priorities
    pending.sort((a, b) => {
      const ra = requests[a];
      const rb = requests[b];
      if (cfg.debug) {
        if (!ra || !rb) {
          throw new Error(`Inconsistent state, pending keys ${a} or ${b} don't have an actual request`);
        }
      }
      // mutations take priority, so we need to  check for those
      if (ra.options.type === 'mutation' && rb.options.type !== 'mutation') {
        return -1;
      }
      if (rb.options.type === 'mutation' && ra.options.type !== 'mutation') {
        return 1;
      }

      const rap = typeof ra.options.priority === 'undefined' ? Number.MIN_SAFE_INTEGER : ra.options.priority;
      const rbp = typeof rb.options.priority === 'undefined' ? Number.MIN_SAFE_INTEGER : rb.options.priority;
      return rbp - rap;
    });

    if (notify) {
      notifySubs(key, { pending: true });
    }
  }

  function addFetching(key: string | string[], notify: boolean = true) {
    const keys = Array.isArray(key) ? key : [key];
    fetching.push(...keys);
    if (notify) {
      keys.forEach(k => notifySubs(k, { fetching: true }));
    }
  }

  function removePending(key: string, notify: boolean = true) {
    const index = pending.indexOf(key);
    if (index < 0) {
      if (cfg.debug) {
        throw new Error(`Can't find pending key: '${key}'`);
      }
      return;
    }
    pending.splice(index, 1);
    if (notify) {
      notifySubs(key, { pending: false });
    }
  }

  function removeFetching(key: string, notify: boolean = true) {
    const index = fetching.indexOf(key);
    if (index < 0) {
      if (cfg.debug) {
        throw new Error(`Can't find fetching key: '${key}'`);
      }
      return;
    }
    fetching.splice(index, 1);
    if (notify) {
      notifySubs(key, { fetching: false });
    }
  }

  function unpackCacheValue<T, ST>(
    key: string,
    storage?: RequestOptionsStorage<T, ST>
  ): { value: T; stale?: boolean } | undefined {
    const value = cache.getState<ST>(key);
    if (!value) {
      return undefined;
    }
    return {
      value: unpackValue<T, ST>(value.value, storage) as T,
      stale: value.stale
    };
  }

  function unpackValue<T, ST>(value: ST, storage?: RequestOptionsStorage<T, ST>): T | undefined {
    if (!value) {
      return undefined;
    }
    const store = storage || (cfg.request && cfg.request.storage) || requestStorageDirect;
    return store.fromStorage(value) as T;
  }

  function packValue<T, ST>(value: T, storage?: RequestOptionsStorage<T, ST>): ST {
    const store = (storage || (cfg.request && cfg.request.storage) || requestStorageDirect) as RequestOptionsStorage<
      T,
      ST
    >;
    return store.toStorage(value);
  }

  function cancel(key: string) {
    const req = requests[key];
    if (!req || req.cancelled) {
      return false;
    }

    if (!isPending(key) && !isFetching(key)) {
      return true;
    }

    req.cancelled = true;
    if (req.cancel) {
      req.cancel();
      req.cancel = undefined;
    }

    removePending(key, false);
    removeFetching(key, false);
    if (req.options.type === 'mutation' || !cache.has(key)) {
      // We don't preserve mutations as they are non-cachable
      // and also those requests which have no data in cache
      removeRequest(key);
    }
    pushQueue();
    return true;
  }

  function request<T, RT = T, ST = unknown, E = Error, ARGS extends unknown[] = unknown[]>(
    key: string,
    r: (...args: ARGS) => Promise<RT>,
    options?: RequestOptions<T, RT, ST, E>,
    ...args: ARGS
  ): RequestState<T, E> {
    // By default treat as a query
    const opts = options || { type: 'query' };
    // Check whether we have the request in our records and cache
    const cacheValue = opts.type === 'query' ? unpackCacheValue<T, ST>(key, opts.storage) : undefined;

    let record = (requests[key] as unknown) as Request<T, RT, ST, E, ARGS> | undefined;

    if (
      (opts.type === 'query' && (opts.forced || cacheValue?.stale)) ||
      !record ||
      record.cancelled ||
      record.expired
    ) {
      if (record) {
        // If there is an ongoing connection and we are forced to restart
        // we need to cancel the existing requests and then replace
        // it with a new record
        cancel(key);
      }

      // Happens when a cache was rehydrated, this way we don't have a notion
      // of this request, but we do have a value for its cache. If a request is
      // not forced - we'll just add it to the list of known requests, but not
      // perform an actual query. Unless it's already stale.
      const wasRehydrated = !record && cacheValue;
      const initiateRequest = !wasRehydrated || (opts.type === 'query' && opts.forced) || cacheValue?.stale ? true : false;

      record = {
        r,
        args: args || [],
        options: opts,
        attempts: 0,
        error: undefined,
        nextAttempt: typeof opts.delay !== 'undefined' ? Date.now() + opts.delay : undefined
      };
      addRequest(key, record, initiateRequest);
    }

    return {
      data: cacheValue && cacheValue.value,
      stale: cacheValue && cacheValue.stale,
      pending: isPending(key),
      fetching: isFetching(key),
      error: record.error
    };
  }

  function refetchByKey(key: string): boolean {
    const record = requests[key];
    if (!record || record.options.type === 'mutation') {
      return false;
    }

    if (isPending(key) || isFetching(key)) {
      // It's already in the queue, just bail out
      return true;
    }

    // Just add it once again so it starts pushing the queue
    addRequest(key, record, true);
    return true;
  }

  function refetchByTags(tags: Tag | Tag[], match: TagMatch = TagMatch.Any, check?: (key: string) => boolean): number {
    const collected = cache.findByTags(tags, match, check);
    collected.forEach(refetchByKey);
    return collected.length;
  }

  function batch<T, AT extends unknown[] = unknown[], RT = T, E = Error>(
    tags: Tag | Tag[],
    match: TagMatch,
    batcher: BatcherFunc<T, AT, RT, E>,
    maxBatchSize?: number
  ): () => void {
    const t = Array.isArray(tags) ? tags : [tags];
    if (t.length === 0) {
      throw new Error(`Batcher can't operate without tags.`);
    }
    const existing = batchers.find(
      c =>
        c.tags.length === t.length && c.match === match && c.tags.filter(ct => t.indexOf(ct) >= 0).length === t.length
    );
    if (!existing) {
      batchers.push(({ tags: t, match, batcher, maxBatchSize } as unknown) as Batcher<unknown>);
    } else {
      // Uncomment for debugging purposes
      // throw new Error(`There is already a batcher for tags: ${t.join(',')}`);
    }

    return () => unbatch(tags, match);
  }

  function unbatch(tags: Tag | Tag[], match: TagMatch): void {
    const t = Array.isArray(tags) ? tags : [tags];
    if (t.length === 0) {
      return;
    }
    const existing = batchers.findIndex(
      c =>
        c.tags.length === t.length && c.match === match && c.tags.filter(ct => t.indexOf(ct) >= 0).length === t.length
    );
    if (existing < 0) {
      // Uncomment for debugging purposes
      // throw new Error(`There is no batcher for tags: ${t.join(',')}`);
    } else {
      batchers.splice(existing, 1);
    }
  }

  function state<T, RT = T, ST = T, E = Error>(key: string): RequestState<T, E> | undefined {
    const record = requests[key] as Request<T, RT, ST, E> | undefined;
    if (!record) {
      return undefined;
    }

    const cacheValue =
      record.options.type === 'query' ? unpackCacheValue<T, ST>(key, record.options.storage) : undefined;

    const reqPending = isPending(key);
    const reqFetching = isFetching(key);

    return {
      data: cacheValue && cacheValue.value,
      stale: cacheValue && cacheValue.stale,
      pending: reqPending,
      fetching: reqFetching,
      attempts: reqPending ? record.attempts : undefined,
      error: record.error
    };
  }

  function removeRequest(key: string) {
    delete requests[key];
  }

  function onCacheChange<T>(key: string, value: T, change: CacheChange) {
    switch (change) {
      case CacheChange.Clear:
      case CacheChange.Expire:
        {
          const req = requests[key];
          if (!req) {
            break;
          }
          req.expired = true;
          notifySubs(key, {
            expired: true
          });
          removeRequest(key);
        }
        break;

      case CacheChange.Update:
        notifySubs(key, {
          manual: true
        });
        break;
    }
  }

  function sub<T, E, U>(key: string, on: ManagerSubCallback<T, E, U>, userData?: U): () => void {
    let listeners = subs[key];

    if (!listeners) {
      listeners = [];
      subs[key] = listeners;
      cache.lock(key);
    }

    listeners.push({cb: on as ManagerSubCallback<unknown, unknown, unknown>, userData});
    return () => {
      unsub(key, on);
    };
  }

  function unsub<T, E, U>(key: string, on: ManagerSubCallback<T, E, U>): void {
    const listeners = subs[key];
    if (!listeners) {
      return;
    }

    const index = listeners.findIndex(l => l.cb === on);
    if (index < 0) {
      return;
    }

    listeners.splice(index, 1);
    if (listeners.length > 0) {
      return;
    }

    delete subs[key];
    cache.unlock(key);
  }

  function subBroadcast<T, E, U>(on: ManagerBroadcast<T, E, U>, userData?: U): () => void {
    subsBroad.push({cb: on as ManagerBroadcast<unknown, unknown, unknown>, userData});
    return () => {
      unsubBroadcast(on);
    };
  }

  function unsubBroadcast<T, E, U>(on: ManagerBroadcast<T, E, U>): void {
    const index = subsBroad.findIndex(l => l.cb === on);
    if (index < 0) {
      return;
    }
    subsBroad.splice(index, 1);
  }

  return {
    request,
    refetchByKey,
    refetchByTags,
    batch,
    unbatch,
    cancel,
    state,
    sub,
    unsub,
    subBroadcast,
    unsubBroadcast,
    fromCache,
    updateCache,
    clearCache,
    clearCacheByTags,
    getCache,
    stats,
    updateConfig
  };
}
