export interface RequestState<T, E = Error> {
  /**
   * data from the request
   */
  data?: T;
  /**
   * indicates whether the data at hand is stale
   */
  stale?: boolean;
  /**
   * pending is true when a request is in the queue
   * to be performed.
   */
  pending?: boolean;
  /**
   * fetching is true when the request is being fetched.
   */
  fetching?: boolean;
  /**
   * attempts number, undefined if request is not ongoing
   * and have already finished with an error or success
   */
  attempts?: number;
  /**
   * error is defined when there was an error during a fetch.
   */
  error?: E;
}

export interface RequestOptionsStorage<T, ST = T> {
  /**
   * toStorage gets executed before the value is placed
   * into cache.
   */
  toStorage: (value: T) => ST;
  /**
   * fromStorage gets executed when a value is extracted
   * from the cache.
   */
  fromStorage: (value: ST) => T;
}

export const requestStorageDirect = {
  toStorage: (value: unknown) => value,
  fromStorage: (value: unknown) => value
};

export const requestStorageJSON = {
  toStorage: (value: unknown) => JSON.stringify(value),
  fromStorage: (value: string) => JSON.parse(value)
};

/**
 * RetryDecayFunc calculates the amount of time that has to pass
 * before trying a next request attempt.
 */
export type RetryDecayFunc = (attempts: number) => number;
export const defaultRetryDecay: RetryDecayFunc = (attempts: number) => Math.min(2 ** attempts, 30) * 1000;

export type RequestTransformFunc<RT, T> = (content: RT) => T;

export interface RequestOptionsBase<T, RT = T, E = Error> {
  /**
   * retries to attempt before failing and stopping retries. If true
   * is provided here, it'll continue retrying indefinitely.
   */
  retries?: number | true;
  /**
   * retryDecay is usually a function defines the interval for the
   * next attempt when a request fails. If a number is provided
   * instead of a function, it'll be a constant value for each attempt.
   * If false is returned, next attempt won't be performed, even if retries
   * is set to true.
   */
  retryDecay?: number | false | ((attempts: number, err: E) => number | false);
  /**
   * priority for this query, some might require higher priority and if provided
   * here will be used for sorting before dispatching next fetch. If there is no
   * limit for number of parallel queries, this option won't have effect.
   */
  priority?: number;
  /**
   * transform gets called upon a payload from the request, in case any transformations
   * have to be performed to extract the useful payload, or to take off an enclosure.
   */
  transform?: RequestTransformFunc<RT, T>;
  /**
   * validate is called first upon receipt of the payload, and can be used to re-consider
   * whether the payload is success or failure. Some APIs do not return http codes
   * with errors and may have errors listed as a part of the typical payload.
   */
  validate?: (payload: RT) => E | undefined;
  /**
   * delay defines the amount of time to wait before calling a request,
   * this gets ignore though if value is already in cache and there is no
   * forced = true provided. Combining delay and cancel debounce can be achieved,
   * or multiple requests can be bundled together of different nature, etc.
   */
  delay?: number;
}

export interface RequestMutationOptions<T, RT = T, E = Error> extends RequestOptionsBase<T, RT, E> {
  type: 'mutation';
}

export interface RequestQueryOptionsBase<T, RT = T, ST = T, E = Error> extends RequestOptionsBase<T, RT, E> {
  type: 'query';
  /**
   * ttl is time to live for the results of this query if it is
   * when it is unmounted. If the query is mounted, this won't have
   * effect.
   */
  ttl?: number;
  /**
   * staleTTL is time to live even when a query is mounted. Once this
   * time passes, it will refresh the content on next request render.
   */
  staleTTL?: number;
  /**
   * storage defines operations to be performed on payload when it is
   * placed into the cache and when it is pulled out. Can be effectively
   * used to serialize / deserialize clones, or classes, etc.
   */
  storage?: RequestOptionsStorage<T, ST>;  
  /**
   * This function gets called when a new values is about to replace the one
   * in cache. If the result is false, it'll replace the value and trigger
   * notifications for all subscribers. If not, the value will be discarded
   * and previous one will remain, which is helpful to avoid redraws if the
   * received content is the same.
   */
  equalityCheck?: (previous: T, next: T) => boolean;  
}

export interface RequestQueryOptions<T, RT = T, ST = T, E = Error> extends RequestQueryOptionsBase<T, RT, ST, E> {
  /**
   * forced forces the query to execute again even if there is data in cache.
   */
  forced?: boolean;
  /**
   * requests can be tagged so that they can be refetched using tags, or cleared up.
   */
  tags?: string[];
}

export type RequestOptions<T, RT = T, ST = T, E = Error> =
  | RequestMutationOptions<T, RT, E>
  | RequestQueryOptions<T, RT, ST, E>;
export type PromiseWithCancel<T> = Promise<T> & { cancel?: () => void };

// Internal model for the RequestManager
export interface Request<T, RT = T, ST = T, E = any, ARGS extends unknown[] = unknown[]> {
  r: (...args: ARGS) => PromiseWithCancel<unknown>;
  args: ARGS;
  options: RequestOptions<T, RT, ST, E>;

  attempts: number;
  nextAttempt?: number;
  error?: E;
  cancel?: () => void;
  cancelled?: boolean;
  expired?: boolean;
}
