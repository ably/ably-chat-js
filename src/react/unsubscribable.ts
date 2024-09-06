/**
 * Utility function to make working with promises inside effects easier.
 *
 * It returns an object with a `unsubscribe` function and a callback wrapper
 * function `cb`. `cb` should be used to wrap all callbacks passed to promises,
 * either in `.then()`, `.catch()`, or `.finally()` if you do not want your
 * code inside the callback to be run after `unsubscribe()` was called.
 *
 * Example usage inside an effect:
 * ```
 * useEffect(() => {
 *   const { unsubscribe, cb } = unsubscribable();
 *   somePromise.then(cb((value) => {
 *     console.log("never prints if unsubscribe is called");
 *   }));
 *   return () => { unsubscribe(); }
 * });
 * ```
 *
 * @returns An object with an `unsubscribe` function and a callback wrapper `cb`.
 */
export function unsubscribable() {
  let subscribed = true;
  const unsubscribe = () => {
    subscribed = false;
  };
  function callbackWrapper<Arguments extends unknown[], Return>(callback: (...args: Arguments) => Return) {
    if (subscribed) {
      return callback;
    }
  }
  return {
    unsubscribe,
    cb: callbackWrapper,
  };
}
