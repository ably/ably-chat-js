import { vi } from 'vitest';

/**
 * Creates a mock function that returns a Promise resolving to null.
 * Useful for mocking methods that return Promise<void> or Promise<null>.
 * @returns A mock function that when called returns Promise<null>
 */
export const mockReturningPromiseNull = () => vi.fn().mockResolvedValue(null);

/**
 * Wraps a synchronous callback function to return a Promise<void>.
 * Useful for mock implementations that need to perform synchronous work but must return a Promise.
 * For example, when we want to emulate a publish (which returns a Promise), but the actual publish
 * mock is synchronous and thus we don't have an await to run.
 * @param callback The synchronous callback to execute
 * @returns A function that executes the callback and returns Promise<void>
 */
export const wrapWithPromise =
  <TArgs extends unknown[]>(callback: (...args: TArgs) => void) =>
  async (...args: TArgs): Promise<void> => {
    callback(...args);
    await Promise.resolve();
  };

/**
 * Creates a promise that resolves after a specified timeout, executing an async function when the timeout concludes.
 * The returned promise resolves with the result of the async function.
 * @template T The return type of the async function
 * @param asyncFn The async function to execute when the timeout concludes
 * @param timeoutMs The timeout duration in milliseconds
 * @returns A promise that resolves with the result of the async function
 * @example
 * ```ts
 * // Execute an async operation after 100ms
 * const result = await withAsyncTimeout(async () => {
 *   await someAsyncOperation();
 *   return 'done';
 * }, 100);
 * ```
 */
export const withAsyncTimeout = async <T>(asyncFn: () => Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      void (async () => {
        try {
          const result = await asyncFn();
          resolve(result);
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    }, timeoutMs);
  });
