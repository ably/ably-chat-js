/**
 * Represents the result of a paginated query.
 */
export interface PaginatedResult<T> {
  /**
   * The items returned by the query.
   */
  items: T[];

  /**
   * Whether there are more items to query.
   * @returns `true` if there are more items to query, `false` otherwise.
   */
  hasNext(): boolean;

  /**
   * Whether this is the last page of items.
   * @returns `true` if this is the last page of items, `false` otherwise.
   */
  isLast(): boolean;

  /**
   * Fetches the next page of items.
   * @returns A promise that resolves with the next page of items or `null` if there are no more items.
   */
  next(): Promise<PaginatedResult<T> | null>;

  /**
   * Fetches the first page of items.
   * @returns A promise that resolves with the first page of items.
   */
  first(): Promise<PaginatedResult<T>>;

  /**
   * Fetches the current page of items (the same as the current page).
   * @returns A promise that resolves with the current page of items.
   */
  current(): Promise<PaginatedResult<T>>;
}
