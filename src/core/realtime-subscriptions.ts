/**
 * Interface for objects that support listeners via the on/off pattern.
 */
interface Onable<T> {
  /**
   * Subscribe to events with a callback.
   * @param callback The callback function to be called when events occur.
   */
  on(callback: (data: T) => void): void;

  /**
   * Subscribe to specific events, with a callback.
   * @param events The events to subscribe to.
   * @param callback The callback function to be called when events occur.
   */
  on(events: string[] | string, callback: (data: T) => void): void;

  /**
   * Subscribe to all events, once.
   */
  once(callback: (data: T) => void): void;

  /**
   * Subscribe to specific events, once.
   */
  once(events: string[] | string, callback: (data: T) => void): void;

  /**
   * Unsubscribe from events with a callback.
   * @param callback The callback function to remove from the subscription.
   */
  off(callback: (data: T) => void): void;
}

/**
 * Interface for objects that support listeners via the subscribe/unsubscribe pattern.
 */
export interface Subscribable<T> {
  /**
   * Subscribe to events with a callback.
   * @param callback The callback function to be called when events occur.
   */
  subscribe(callback: (data: T) => void): void;

  /**
   * Subscribe to specific events, with a callback.
   * @param events The events to subscribe to.
   * @param callback The callback function to be called when events occur.
   */
  subscribe(events: string[] | string, callback: (data: T) => void): void;

  /**
   * Unsubscribe from events with a callback.
   * @param callback The callback function to remove from the subscription.
   */
  unsubscribe(callback: (data: T) => void): void;
}

/**
 * Subscribe to events on an emitter and return a cleanup function.
 *
 * Overload 1: Subscribe to all events.
 * Overload 2: Subscribe to specific events (string or string[]).
 *
 * @param emitter The event emitter object that has `on` and `off` methods.
 * @param callback The callback function to be called when events occur.
 * @returns A cleanup function that when called will unsubscribe the callback.
 */
export function on<T>(emitter: Onable<T>, callback: (data: T) => void): () => void;
export function on<T>(emitter: Onable<T>, events: string | string[], callback: (data: T) => void): () => void;
export function on<T>(
  emitter: Onable<T>,
  arg2: ((data: T) => void) | string | string[],
  arg3?: (data: T) => void,
): () => void {
  if ((Array.isArray(arg2) || typeof arg2 === 'string') && arg3) {
    emitter.on(arg2, arg3);
    return () => {
      emitter.off(arg3);
    };
  } else if (typeof arg2 === 'function') {
    emitter.on(arg2);
    return () => {
      emitter.off(arg2);
    };
  } else {
    throw new TypeError('Invalid arguments passed to on()');
  }
}

export function once<T>(emitter: Onable<T>, callback: (data: T) => void): () => void;
export function once<T>(emitter: Onable<T>, events: string | string[], callback: (data: T) => void): () => void;
export function once<T>(
  emitter: Onable<T>,
  arg2: ((data: T) => void) | string | string[],
  arg3?: (data: T) => void,
): () => void {
  if ((Array.isArray(arg2) || typeof arg2 === 'string') && arg3) {
    emitter.once(arg2, arg3);
    return () => {
      emitter.off(arg3);
    };
  } else if (typeof arg2 === 'function') {
    emitter.once(arg2);
    return () => {
      emitter.off(arg2);
    };
  } else {
    throw new TypeError('Invalid arguments passed to once()');
  }
}

/**
 * Subscribe to events on an emitter and return a cleanup function.
 *
 * Overload 1: Subscribe to all events.
 * Overload 2: Subscribe to specific events (string or string[]).
 *
 * @param emitter The event emitter object that has `subscribe` and `unsubscribe` methods.
 * @param callback The callback function to be called when events occur.
 * @returns A cleanup function that when called will unsubscribe the callback.
 */
export function subscribe<T>(emitter: Subscribable<T>, callback: (data: T) => void): () => void;
export function subscribe<T>(
  emitter: Subscribable<T>,
  events: string | string[],
  callback: (data: T) => void,
): () => void;
export function subscribe<T>(
  emitter: Subscribable<T>,
  arg2: ((data: T) => void) | string | string[],
  arg3?: (data: T) => void,
): () => void {
  if ((Array.isArray(arg2) || typeof arg2 === 'string') && arg3) {
    emitter.subscribe(arg2, arg3);
    return () => {
      emitter.unsubscribe(arg3);
    };
  } else if (typeof arg2 === 'function') {
    emitter.subscribe(arg2);
    return () => {
      emitter.unsubscribe(arg2);
    };
  } else {
    throw new TypeError('Invalid arguments passed to subscribe()');
  }
}
