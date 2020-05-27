import {
  RequestState,
  RequestQueryOptionsBase
} from './request';

/**
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

/**
 * Manager configuration
 */
export interface ManagerConfig {
  /**
   * debug enables some extra information to be logged
   * while the manager operates.
   */
  debug?: boolean;
  /**
   * request default configuration if needed.
   */
  request?: RequestQueryOptionsBase<any>;
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

/**
 * Default manager configuration.
 */
export const defaultManagerConfig: ManagerConfig = {
  maxParallelRequests: -1
};
