import { useContext, useCallback, useRef, useState } from 'react';

import { Manager, RequestState, RequestMutationOptions, SubReason } from '../manager';
import { CacheKeyParam, CacheKeyFunc, cacheKeyHash, computeCacheKey } from '../cache';
import { ManagerContext } from './context';

export type MutationRequestState<T, E> = RequestState<T, E>;

export interface MutationCallbacks<T, C = unknown, E = any, ARGS extends unknown[] = unknown[]> {
  /**
   * Request callback, called immediately before the mutation request gets dispatched.
   * Here manager can be used to capture values needed, or cache updated,
   * or anything else that needs to be preserved while the request is ongoing.
   * The captured data has to be returned in this method, then it will be
   * passed along into success or error callbacks. In case of retries, this does not
   * get called again upon retry, only at the first try.
   */
  onRequest?: (manager: Manager, ...args: ARGS) => C;
  /**
   * Success callback, which provides the resulting data from the mutation,
   * a manager that was used for the request or picked up from a context,
   * and original arguments, both static and dynamic that were provided.
   */
  onSuccess?: (data: T, captured: C, manager: Manager, ...args: ARGS) => void;
  /**
   * Retry callback, gets called each time we got an error upon an attempt, but some
   * further retries will be performed.
   */
  onRetry?: (captured: C, manager: Manager, ...args: ARGS) => void;
  /**
   * Error callback, which provides the error from the mutation failure,
   * a manager that was used for the request or picked up from a context,
   * and original arguments, both static and dynamic that were provided.
   * This does not get called when retry fails and there are more to try.
   */
  onError?: (error: E, captured: C, manager: Manager, ...args: ARGS) => void;
  /**
   * Called whether an error or success event happened. Called after success / error
   * handlers.
   */
  onComplete?: (data: T | undefined, error: E | undefined, captured: C, manager: Manager, ...args: ARGS) => void;

  /**
   * High level notification method, which gets called every time there is a change
   * to one or the other mutation. When blocking is set to false, this will get called
   * for every single mutation that was called. Besides the state and reason for the update,
   * request manager and original arguments, both static and dynamic will be passed through.
   */
  onUpdate?: (
    state: MutationRequestState<T, E>,
    reason: SubReason,
    manager: Manager,
    captured: C,
    ...args: ARGS
  ) => void;
}

/**
 * Mutation request options
 */
export interface MutationOptions<T, C = unknown, RT = T, E = any, ARGS extends unknown[] = unknown[]>
  extends Omit<RequestMutationOptions<T, RT, E>, 'type'>,
    MutationCallbacks<T, C, E, ARGS> {
  /**
   * manager to be used for all the queries and cache. Generally not needed for the regular
   * use cases, but can be overridden here.
   */
  manager?: Manager;
  /**
   * Multiple mutations means that the same mutation can be called multiple times, concurrently.
   * Every mutator call will get a new unique key. Generally, it is good practice to make sure you
   * don't request something twice immediately, and should normally be true only if you can't bundle
   * an update into a single request and have to issue multiple ones. For example, if you need to
   * delete multiple users by ID at once and API only supports a single user deletion and doesn't accept an
   * array of IDs, then you'd make this true and call multiple times the same mutation with different
   * arguments.
   */
  multiple?: boolean;
  /**
   * cacheKeyGenerator generates a key param for the mutation. Since mutations generally don't
   * really have a cache key, this method is used to generate some unique key for each outgoing
   * request. The default behavior is just a timestamp with a prefix, however it can be enhanced
   * with actual arguments. Result of this method is then passed into the cacheKeyFunc. Both
   * static and dynamic parameters are passed to the generator function. Mutation key is generally
   * not used by the user, mostly for internal management of the outgoing requests.
   */
  cacheKeyGenerator?: (...args: ARGS) => CacheKeyParam;
  /**
   * cacheKeyFunc can be provided to calculate a key differently from the
   * default wait via cacheKeyHash.
   */
  cacheKeyFunc?: CacheKeyFunc;
}

/**
 * @internal
 */
export const defaultCacheKeyGenerator = <ARGS extends unknown[] = unknown[]>(...args: ARGS): CacheKeyParam => {
  return `mut-${Date.now()}`;
};

export interface MutationState<T, E = any> {
  data?: T;
  pending?: boolean;
  error?: E;
}

interface MutationRecord<T, C, E, ARGS extends unknown[]> {
  captured: C;
  args: ARGS;
  callbacks?: MutationCallbacks<T, C, E, ARGS>;
}

export interface MutationInstanceConfig<T, C, E, ARGS extends unknown[]> {
  on: (callbacks: Omit<MutationCallbacks<T, C, E, ARGS>, 'onRequest'>) => MutationInstanceConfig<T, C, E, ARGS>;
}

/**
 * useMutation hook to execute mutations, provides a set of helpers for each work with a manager
 * and cache.
 * @template T Type expected to be in the request response, after all transformations.
 * @template C Captured data type, which is then passed around all callbacks.
 * @template RT Received type by the request. Often is the same as T, but can be different in case a transformation is applied to the RT to convert it to T.
 * @template E Error type returned by the query. Default value is Error, but can be extended if needed.
 * @template ARGS Arguments type which are required for the request function.
 * 
 * @param request Request function to be called upon mutation.
 * @param options Request behavior options, optional.
 */
export function useMutation<T, C = unknown, RT = T, E = Error, ARGS extends unknown[] = unknown[]>(
  /**
   * Request function, which will receive static arguments first, then it
   * will be followed by arguments provided dynamically upon the call.
   */
  request: (...args: ARGS) => Promise<RT>,
  /**
   * Request options, such as retries, decay, etc.
   */
  options: Partial<MutationOptions<T, C, RT, E, ARGS>> | undefined
): [(...args: ARGS) => MutationInstanceConfig<T, C, E, ARGS>, MutationState<T, E>] {
  const opt = options || {};

  const contextManager = useContext(ManagerContext);
  const manager = opt.manager || contextManager;

  if (!manager) {
    throw new Error(`Manager must be provided explicitly or through a context`);
  }

  // Store captured values here for the purpose of exposing them later
  // at different callbacks
  const captured = useRef<Record<string, MutationRecord<T, C, E, ARGS>>>({});
  const [lastState, setLastState] = useState({});

  // We preserve the latest options callbacks, so that we have the latest state
  // of those at the time a previously submitted request tries to call them.
  const callbacks = useRef<MutationOptions<T, C, RT, E, ARGS>>(opt);
  callbacks.current = opt;

  const cacheKeyFunc = useCallback(
    (...args: ARGS) => {
      const cacheFunc: CacheKeyFunc = opt.cacheKeyFunc || cacheKeyHash;
      const keyGeneratorFunc = opt.cacheKeyGenerator || defaultCacheKeyGenerator;
      return computeCacheKey(keyGeneratorFunc(...args), cacheFunc);
    },
    [opt.cacheKeyFunc, opt.cacheKeyGenerator]
  );

  const notify = useCallback(
    (record: MutationRecord<T, C, E, ARGS>, state: MutationRequestState<T, E>, reason: SubReason) => {
      const c = record.captured;
      const ca = record.args;
      // Retry
      if (reason.fetching === true && typeof state.attempts !== 'undefined' && state.attempts > 0) {
        if (record.callbacks?.onRetry) {
          record.callbacks.onRetry(c, manager, ...ca);
        }
        if (callbacks.current.onRetry) {
          callbacks.current.onRetry(c, manager, ...ca);
        }
      }

      // Success
      if (reason.success) {
        if (typeof state.data === 'undefined') {
          throw new Error(`Got undefined data in a success callback`);
        }
        if (record.callbacks?.onSuccess) {
          record.callbacks.onSuccess(state.data, c, manager, ...ca);
        }
        if (callbacks.current.onSuccess) {
          callbacks.current.onSuccess(state.data, c, manager, ...ca);
        }
        if (record.callbacks?.onComplete) {
          record.callbacks.onComplete(state.data, undefined, c, manager, ...ca);
        }
        if (callbacks.current.onComplete) {
          callbacks.current.onComplete(state.data, undefined, c, manager, ...ca);
        }
      }

      // Error
      if (reason.error && state.error) {
        // No more retries
        if (reason.pending === false) {
          if (record.callbacks?.onError) {
            record.callbacks.onError(state.error, c, manager, ...ca);
          }
          if (callbacks.current.onError) {
            callbacks.current.onError(state.error, c, manager, ...ca);
          }
          if (record.callbacks?.onComplete) {
            record.callbacks.onComplete(undefined, state.error, c, manager, ...ca);
          }
          if (callbacks.current.onComplete) {
            callbacks.current.onComplete(undefined, state.error, c, manager, ...ca);
          }
        }
      }

      if (record.callbacks?.onUpdate) {
        record.callbacks?.onUpdate(state, reason, manager, c, ...ca);
      }
      if (callbacks.current.onUpdate) {
        callbacks.current.onUpdate(state, reason, manager, c, ...ca);
      }
    },
    [manager]
  );

  const mutator = useCallback(
    (...args: ARGS): MutationInstanceConfig<T, C, E, ARGS> => {
      // Make a few checks before moving forward
      if (!opt.multiple && Object.keys(captured.current).length > 0) {
        throw new Error(`Trying to call a new request, while an existing one is in progress.`);
      }
      const k = cacheKeyFunc(...args);
      if (!k) {
        throw new Error(`Key must be defined, calculation returned undefined`);
      }
      if (k in captured.current) {
        throw new Error(`Identical key was generated to the already one in progress`);
      }

      const c = callbacks.current.onRequest ? callbacks.current.onRequest(manager, ...args) : undefined;
      const record: MutationRecord<T, C, E, ARGS> = {
        captured: c as C,
        args
      };
      captured.current[k] = record;

      const res: MutationInstanceConfig<T, C, E, ARGS> = {
        on: instanceCallbacks => {
          record.callbacks = instanceCallbacks;
          return res;
        }
      };

      const onUpdate = (state: RequestState<T, E>, reason: SubReason) => {
        const hasFinished = reason.pending === false && (reason.success || reason.error);
        if (hasFinished) {
          delete captured.current[k];
          manager.unsub(k, onUpdate);
          setLastState({ pending: false, data: state.data, error: state.error });
        }
        try {
          notify(record, state, reason);
        } catch (err) {
          console.error(`Error during notification: `, err, state, reason);
        }
      };

      manager.sub(k, onUpdate);
      manager.request(
        k,
        request,
        {
          type: 'mutation',
          retries: opt.retries,
          retryDecay: opt.retryDecay,
          priority: opt.priority,
          transform: opt.transform,
          delay: opt.delay
        },
        ...args
      );

      setLastState({ pending: true });
      return res;
    },
    [
      manager,
      request,
      notify,
      cacheKeyFunc,
      opt.multiple,
      opt.retries,
      opt.retryDecay,
      opt.priority,
      opt.transform,
      opt.delay
    ]
  );

  return [mutator, lastState];
}
