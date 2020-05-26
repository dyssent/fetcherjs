export type Tag = string;

export enum TagMatch {
  /**
   * Match entities that have all of the tags.
   */
  All = 'all',
  /**
   * Match all entities that have at least one of the tags.
   */
  Any = 'any',
  /**
   * Match all entities that have none of the tags. This is a slow operation
   * as it has to iterate through all requests and must be used with caution.
   */
  None = 'none'
}
