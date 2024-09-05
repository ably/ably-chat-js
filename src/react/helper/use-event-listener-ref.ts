import { useCallback, useEffect, useRef } from 'react';

/**
 * The type of a callback function that can be stored in the reference.
 */
type Callback<CallbackArguments extends unknown[]> = (...args: CallbackArguments) => void;

/**
 * A hook that creates a reference to an event listener callback function. It is used to stabilize the reference
 * across renders, so that listeners don't get unsubscribed and resubscribed on every render when passed in as a prop.
 *
 * For example, doing this:
 *
 * ```jsx
 *   export function MySubscription() {
 *     useHookWithListener(() => {})
 *
 *     return <div>My Subscription</div>
 *   }
 * ```
 *
 * Where the `useHookWithListener` hook is defined as:
 *
 * ```jsx
 *  export function useHookWithListener(listener) {
 *    const listenerRef = useEventListenerRef(listener);
 *    useEffect(() => {
 *      // Use the listenerRef
 *    }, [listenerRef]);
 * }
 * ```
 *
 * Will ensure that the listener is not unsubscribed and resubscribed on every render (i.e. the useEffect will not be called
 * on every render).
 *
 * We allow for the callback to be undefined, as callbacks in the majority of our hooks are optional.
 *
 * @internal
 * @template Arguments - The type of arguments accepted by the callback function.
 * @param callback - The callback function to be stored in the reference.
 * @returns The callback function stored in the reference.
 */
export const useEventListenerRef = <Arguments extends unknown[]>(
  callback?: Callback<Arguments>,
): Callback<Arguments> => {
  const ref = useRef<Callback<Arguments> | undefined>(callback);
  useEffect(() => {
    ref.current = callback;
  });

  return useCallback((...args: Arguments) => {
    ref.current && ref.current(...args);
  }, []);
};
