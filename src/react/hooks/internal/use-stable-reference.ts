import { useCallback, useEffect, useRef } from 'react';

/**
 * The type of a callback function that can be stored in the reference.
 */
type Callback<CallbackArguments extends unknown[], ReturnType> = (...args: CallbackArguments) => ReturnType;

/**
 * In some cases, we want to use a callback that is always the same, and always persists across renders.
 * This function creates a stable reference to a callback, so that it can be used in a `useEffect` or `useCallback`
 * without causing unnecessary re-renders.
 * @internal
 * @param callback The callback to turn into a stable reference
 * @returns A stable reference to the callback
 */
export const useStableReference = <Arguments extends unknown[], ReturnType>(
  callback: Callback<Arguments, ReturnType>,
): Callback<Arguments, ReturnType> => {
  const ref = useRef<Callback<Arguments, ReturnType>>(callback);
  useEffect(() => {
    ref.current = callback;
  });

  return useCallback((...args: Arguments) => ref.current(...args), []);
};
