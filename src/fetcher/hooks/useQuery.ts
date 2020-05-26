import { useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { CacheKeyParam, CacheKeyFunc, Tag, TagMatch } from '../cache';
import { Manager, RequestState, ManagerContext, RequestQueryOptions, SubReason, BatcherFunc } from '../manager';

import { useWindowFocus } from './useWindowFocus';
import { useOnline } from './useOnline';
import { useTimer } from './useTimer';
import { useKeyHash } from './useKeyHash';
import { useImmediateEffect } from './useImmediateEffect';
import { SSR } from './utils';

export type QueryArgs<K, ARGS extends unknown[]> = K extends false | undefined | null ? Partial<ARGS> : ARGS;
export interface QueryRequestState<T, E = Error> extends RequestState<T, E> {
  /**
   * Retained previous value, if activated in options
   */
  previousValue?: T;
  /**
   * Forced refresh of the query
   */
  refresh: () => RequestState<T, E>;
  /**
   * Immediate modification of the data in cache
   * stored at the request key. This doest not execute
   * any remote requests, and only performs update
   * in the local cache.
   */
  mutate: (value: T) => void;
  /**
   * Cancel an ongoing request. This should normally be used
   * only when in combination with a manual request, otherwise
   * the state at which request might stay is difficult to track.
   */
  cancel: () => void;

  /**
   * Key creation cycle example:
   *         Original Key Structure        =>   Stringified Key   =>   Hashed key
   * ['id', 20, {age: 5, name: undefined}] => "['id',20,{age=5}]" => "1238761378613"
   */
  hash: string | undefined;
  /**
   * Hash function used to convert key into a string representation
   */
  hashFunc: (kp: CacheKeyParam) => string | undefined;

  /**
   * Manager that is used by the query to perform requests
   */
  manager: Manager;
}

export interface QueryCallbacks<T, E = Error> {
  /**
   * Request callback, called immediately before the query request gets dispatched.
   * In case of retries, this does not get called again upon retry, only at the first try.
   */
  onRequest?: (manager: Manager) => void;
  /**
   * Success callback, which provides the resulting data from the query,
   * a manager that was used for the request or picked up from a context.
   */
  onSuccess?: (data: T, manager: Manager) => void;
  /**
   * Retry callback, gets called each time we attempt to execute a request.
   * onRequest is called only the first time, further attempts will be called
   * with onRetry callback.
   */
  onRetry?: (manager: Manager) => void;
  /**
   * Error callback, which provides the error from the query failure,
   * a manager that was used for the request or picked up from a context.
   * This does not get called when retry fails and there are more to try.
   */
  onError?: (error: E, manager: Manager) => void;
  /**
   * Called whether an error or success event happened. Called after success / error
   * handlers.
   */
  onComplete?: (data: T | undefined, error: E | undefined, manager: Manager) => void;

  /**
   * High level notification method, which gets called every time there is a change
   * to a query request state.
   */
  onUpdate?: (state: QueryRequestState<T, E>, reason: SubReason, manager: Manager) => void;
}

export interface QueryOptions<T, RT = T, ST = T, E = Error, ARGS extends unknown[] = unknown[]>
  extends Omit<RequestQueryOptions<T, RT, ST, E>, 'type'>,
    QueryCallbacks<T, E> {
  /**
   * refreshOnFocus refreshes the query if window gets focused.
   */
  refreshOnFocus?: boolean;
  /**
   * refreshOnFocusThreshold defines how much time since the last focus
   * has to pass in order to trigger a refresh.
   */
  refreshOnFocusThreshold?: number;
  /**
   * refreshOnOnline refreshes the query if internet connection.
   * restores
   */
  refreshOnOnline?: boolean;
  /**
   * refreshOnOnlineThreshold defines how much time since the last offline
   * moment has to pass in order to trigger a refresh.
   */
  refreshOnOnlineThreshold?: number;

  /**
   * refreshInterval is an automatic refresh every X milliseconds.
   */
  refreshInterval?: number;

  /**
   * initialValue is provided only at start, but if a request fails after that
   * or succeds - its value will be used.
   */
  initialValue?: T;
  /**
   * fallbackValue is provided whenever the actual value is undefined. This is good when
   * having some value is better than none.
   */
  fallbackValue?: T;
  /**
   * retainPreviousValue if true, will keep a reference to the previous key value, which can be
   * handy for pagination or other use cases where previous data is still needed, even though
   * a key is different now. Only key difference will be taken into account when assessing whether
   * the value has to be updated.
   */
  retainPreviousValue?: boolean;
  /**
   * If true, will throw an error on render in case a request is pending or has an error.
   */
  suspense?: boolean;
  /**
   * Debounce makes sense to combine with a delay, so that there is time to cancel a previous request,
   * otherwie it may have been already out and interrupting it might still do the actual server request.
   * When debounce is set to true, then the previous key request will get cancelled, making it more
   * efficient for cases with filters or any other fields where typing text takes place.
   */
  debounce?: boolean;
  /**
   * If set to true, queries won't be automatically applied upon key or content change, and only
   * shoot if a refresh function is used.
   */
  manual?: boolean;

  /**
   * By default, rendering on the server side resolves all queries promises before returning the rendered
   * content to the client. It is sometimes undesirable to wait for those, and then can be manually toggled
   * to off if server should not attempt to query those and leave it for the client side only. Default value
   * is true, however providing false will turn this off.
   */
  ssr?: boolean;

  /**
   * Batcher is used to combine together multiple requests within a short timeframe into a single request.
   * It must be combined with a delay, or it will have no time to batch requests. First param to the batcher
   * in each args list will be a cache key.
   */
  batcher?: BatcherFunc<T, ARGS, RT, E>;
  /**
   *  By default batcher uses tags from the options, however if they vary for different queries and you
   *  want to override with a different set, it can be set here.
   */
  batcherTags?: Tag | Tag[];
  /**
   *  By default the value is Match All.
   */
  batcherTagsMatch?: TagMatch;
  /**
   * manager to be used for all the queries and cache. Generally not needed for the regular
   * use cases, but can be overridden here.
   */
  manager?: Manager;
  /**
   * cacheKeyFunc can be provided to calculate a key differently from the
   * default wait via cacheKeyHash
   */
  cacheKeyFunc?: CacheKeyFunc;
}

export function useQuery<T, RT = T, ST = T, E = Error, ARGS extends unknown[] = unknown[]>(
  /**
   * Caching key, must be unique as it will be used for caching. By default it uses deep stringify,
   * which does deep compare. If a shallow one is needed, a different cacheKeyFunc can be provided in options.
   */
  key: CacheKeyParam,
  /**
   * Function to be call for the request. First argument is always the key that is then followed by other args.
   */
  request: (...args: ARGS) => Promise<RT>,
  /**
   * Options on how to treat the request, which includes caching, refresh logic, and similar. See QueryOptions
   * for more details.
   */
  options?: QueryOptions<T, RT, ST, E, ARGS>,
  /**
   * Optional arguments to be appended after the first key argument to the request function.
   */
  ...args: QueryArgs<CacheKeyParam, ARGS>
): QueryRequestState<T, E> {
  const opt = options || {};

  const contextManager = useContext(ManagerContext);
  const manager = opt.manager || contextManager;

  if (!manager) {
    throw new Error(`Manager must be provided explicitly or through a context`);
  }

  const [cacheKey, cacheFunc] = useKeyHash(key, opt.cacheKeyFunc);

  const lastKey = useRef(cacheKey);

  // Memoize tags, so that a non stable array can be used
  const stableTags = useMemo(() => {
    return opt.tags;
  }, [...(opt.tags || [])]);

  // key might be an array, but we compute a hash of it, so we don't want to provide it
  // as a dependency here, just a hash of it using the cacheKey
  // const r = useCallback(() => request(key, ...args), [request, cacheKey, ...args]);
  const mr = useCallback(
    (forced?: boolean): RequestState<T, E> => {
      if (!cacheKey || (SSR && opt.ssr === false)) {
        return {};
      }

      return manager.request<T, RT, ST, E, ARGS>(
        cacheKey,
        request,
        {
          ttl: opt.ttl,
          staleTTL: opt.staleTTL,
          retries: opt.retries,
          retryDecay: opt.retryDecay,
          storage: opt.storage,
          forced: forced || opt.forced,
          priority: opt.priority,
          transform: opt.transform,
          validate: opt.validate,
          equalityCheck: opt.equalityCheck,
          delay: opt.delay,
          tags: stableTags,
          type: 'query'
        },
        ...(args as ARGS) // it is safe to do here, as we check the key to make sure the args are legit
      );
    },
    [
      request,
      ...args,
      cacheKey,
      opt.ttl,
      opt.staleTTL,
      opt.retries,
      opt.retryDecay,
      opt.storage,
      opt.forced,
      opt.transform,
      opt.validate,
      opt.priority,
      opt.delay,
      opt.equalityCheck,
      opt.ssr,
      stableTags
    ]
  );

  // We preserve the latest options callbacks, just so we can use unstable
  // global handlers, as they are more convenient overall
  const callbacks = useRef<QueryCallbacks<T, E>>(opt);
  callbacks.current = opt;

  const notify = useCallback(
    (req: QueryRequestState<T, E>, reason: SubReason) => {
      // Look only for the first one, where pending is also true,
      // we don't want to call this one on retry.
      if (reason.fetching === true) {
        if (callbacks.current.onRequest && req.attempts === 0) {
          callbacks.current.onRequest(manager);
        } else if (callbacks.current.onRetry){
          callbacks.current.onRetry(manager);
        }
      }
      // Success
      if (reason.success) {
        if (typeof req.data === 'undefined') {
          throw new Error(`Got undefined data in a success callback`);
        }
        if (callbacks.current.onSuccess) {
          callbacks.current.onSuccess(req.data, manager);
        }
        if (callbacks.current.onComplete) {
          callbacks.current.onComplete(req.data, undefined, manager);
        }
      }

      // Error
      if (reason.error && req.error) {
        // No more retries
        if (reason.pending === false) {
          if (callbacks.current.onError) {
            callbacks.current.onError(req.error, manager);
          }
          if (callbacks.current.onComplete) {
            callbacks.current.onComplete(undefined, req.error, manager);
          }
        }
      }

      if (callbacks.current.onUpdate) {
        callbacks.current.onUpdate(req, reason, manager);
      }
    },
    [manager]
  );

  const mutate = useCallback(
    (value: T, ttl?: number | undefined, staleTTL?: number | undefined) => {
      if (!cacheKey) {
        return;
      }
      manager.updateCache(cacheKey, value, ttl, staleTTL);
    },
    [cacheKey]
  );

  const [state, setState] = useState<RequestState<T, E>>(() => {
    const initial: RequestState<T, E> = (cacheKey ? manager.state(cacheKey) : undefined) || {};
    return {
      ...initial,
      data: typeof initial.data === 'undefined' ? opt.initialValue : initial.data
    };
  });
  const previousValue = useRef<T | undefined>(undefined);
  // Resolve and reject of the promise to be called when a manager
  // finishes the reques. This is only filled in if in Suspense mode
  // and bene at least called once with a promise thrown.
  const suspensePromise = useRef<[(value: T) => void, (err: any) => void]>();

  const cancel = useCallback(() => {
    if (!cacheKey) {
      return;
    }
    return manager.cancel(cacheKey);
  }, [manager, cacheKey]);
  const refresh = useCallback(() => mr(true), [mr]);
  const refetchIfTrue = useCallback(
    (value: boolean) => {
      if (value) {
        refresh();
      }
    },
    [refresh]
  );
  const timerRefresh = useCallback(() => {
    if (state.pending) {
      return;
    }
    refresh();
  }, [refresh, state]);

  useTimer(opt.refreshInterval, timerRefresh);
  useWindowFocus(refetchIfTrue, opt.refreshOnFocus ? true : false, opt.refreshOnFocusThreshold);
  useOnline(refetchIfTrue, opt.refreshOnOnline ? true : false, opt.refreshOnOnlineThreshold);

  // Hook up a batcher if provided
  useEffect(() => {
    const match = typeof opt.batcherTagsMatch === 'undefined' ? TagMatch.All : opt.batcherTagsMatch;
    const tags = opt.batcherTags || opt.tags;
    if (!opt.batcher || !tags || tags.length === 0) {
      // Can't batch if no tags provided
      return;
    }
    return manager.batch(tags, match, opt.batcher);
  }, [opt.batcher, opt.batcherTags, opt.batcherTagsMatch, opt.tags]);

  // Logic to save previous value in case it is enabled and a key is different
  useEffect(() => {
    if (lastKey.current === cacheKey || !opt.retainPreviousValue) {
      return;
    }
    previousValue.current = state.data;
  }, [cacheKey, state.data]);

  // Subscribe to updates to a new key if needed.
  //
  // Important! We need to do this before we
  // do the next immediate effect where the request will
  // be done, otherwise we miss initial onRequest and other
  // updates
  useImmediateEffect(() => {
    if (!cacheKey) {
      return;
    }

    function onStateChange(v: RequestState<T, E>, reason: SubReason) {
      setState(v);
      notify(
        {
          ...v,
          previousValue: previousValue.current,
          refresh,
          cancel,
          mutate,
          hash: cacheKey,
          hashFunc: cacheFunc,
          manager
        },
        reason
      );

      if (suspensePromise.current) {
        if (reason.success) {
          suspensePromise.current[0](v.data as T);
        } else if (reason.error && reason.pending === false) {
          suspensePromise.current[1](v.error);
        }
      }
    }

    return manager.sub(cacheKey, onStateChange);
  }, [manager, mutate, refresh, cacheKey, cancel, notify]);

  // If request function has changed, we need to refetch the
  // state for it
  useImmediateEffect((first?: boolean) => {
    if (opt.manual) {
      return;
    }

    if (first) {
      // For first request, preserve the initial value
      const reqState = mr();
      setState({
        ...reqState,
        data: typeof reqState.data === 'undefined' ? opt.initialValue : reqState.data
      });
    } else {
      setState(mr());
    }
  }, [mr, opt.manual]);

  // Logic to update the previous key and cancel a previous request
  // in case it was delayed and is still being performed
  useEffect(() => {
    if (lastKey.current === cacheKey) {
      return;
    }

    if (typeof lastKey.current !== 'undefined' && opt.debounce) {
      manager.cancel(lastKey.current);
    }

    lastKey.current = cacheKey;
  }, [cacheKey, opt.debounce]);

  // For suspense or error boundary mode to work, we need to throw an error
  // if a request failed completely, or throw a Promise, so that it can be waited
  // upon to retry a render again later.
  if (opt.suspense) {
    if (!state.pending) {
      if (state.error) {
        throw state.error;
      }
    } else {
      // Prepare a promise to wait for.
      throw new Promise((resolve, reject) => {
        suspensePromise.current = [resolve, reject];
      });
    }
  }

  return {
    ...state,
    data: typeof state.data === 'undefined' ? opt.fallbackValue : state.data,
    previousValue: previousValue.current,
    refresh,
    mutate,
    cancel,
    hash: cacheKey,
    hashFunc: cacheFunc,
    manager
  };
}
