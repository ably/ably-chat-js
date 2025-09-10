/**
 * Interface for objects that support listeners via the on/off pattern.
 */
export interface Onable<T> {
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
  subscribe(callback: (data: T) => void): Promise<unknown>;

  /**
   * Subscribe to specific events, with a callback.
   * @param events The events to subscribe to.
   * @param callback The callback function to be called when events occur.
   */
  subscribe(events: string[] | string, callback: (data: T) => void): Promise<unknown>;

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
 * @param emitter The event emitter object that has `on` and `off` methods.
 * @param callback The callback function to be called when events occur.
 * @returns A cleanup function that when called will unsubscribe the callback.
 */
export function on<T>(emitter: Onable<T>, callback: (data: T) => void): () => void;
export function on<T>(emitter: Onable<T>, events: string | string[], callback: (data: T) => void): () => void;

/**
 * @param emitter The event emitter object that has `on` and `off` methods.
 * @param arg2 Either a callback function (for subscribing to all events) or event names (string or string[]) to subscribe to specific events.
 * @param arg3 The callback function to be called when events occur (only used when arg2 is event names).
 * @returns A cleanup function that when called will unsubscribe the callback.
 * @throws {TypeError} If the arguments passed are invalid.
 * @example
 * ```typescript
 * // Subscribe to all events
 * const cleanup = on(emitter, (data) => console.log(data));
 * // Subscribe to specific events
 * const cleanup = on(emitter, 'eventName', (data) => console.log(data));
 * const cleanup = on(emitter, ['event1', 'event2'], (data) => console.log(data));
 * ```
 */
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

/**
 * Subscribe to events on an emitter and return a cleanup function.
 *
 * Overload 1: Subscribe to all events once.
 * Overload 2: Subscribe to specific events (string or string[]) once.
 * @param emitter The event emitter object that has `once` and `off` methods.
 * @param callback The callback function to be called when events occur.
 * @returns A cleanup function that when called will unsubscribe the callback.
 * @example
 * ```typescript
 * // Subscribe to all events once
 * const cleanup = once(emitter, (data) => console.log(data));
 * // Subscribe to specific events once
 * const cleanup = once(emitter, 'eventName', (data) => console.log(data));
 * const cleanup = once(emitter, ['event1', 'event2'], (data) => console.log(data));
 * ```
 */
export function once<T>(emitter: Onable<T>, callback: (data: T) => void): () => void;
export function once<T>(emitter: Onable<T>, events: string | string[], callback: (data: T) => void): () => void;
/**
 * @param emitter The event emitter object that has `once` and `off` methods.
 * @param arg2 Either a callback function (for subscribing to all events) or event names (string or string[]) to subscribe to specific events.
 * @param arg3 The callback function to be called when events occur (only used when arg2 is event names).
 * @returns A cleanup function that when called will unsubscribe the callback.
 */
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
 * @param emitter The event emitter object that has `subscribe` and `unsubscribe` methods.
 * @param callback The callback function to be called when events occur (only used when first parameter is event names).
 * @returns A cleanup function that when called will unsubscribe the callback.
 * @example
 * ```typescript
 * // Subscribe to all events
 * const unsubscribe = subscribe(emitter, (data) => console.log(data));
 *
 * // Subscribe to specific events
 * const unsubscribe = subscribe(emitter, 'eventName', (data) => console.log(data));
 * const unsubscribe = subscribe(emitter, ['event1', 'event2'], (data) => console.log(data));
 * ```
 */
export function subscribe<T>(emitter: Subscribable<T>, callback: (data: T) => void): () => void;
export function subscribe<T>(
  emitter: Subscribable<T>,
  events: string | string[],
  callback: (data: T) => void,
): () => void;
/**
 * Subscribe to events on an emitter and return a cleanup function.
 * This is the implementation function that handles both overloads.
 * @param emitter The event emitter object that has `subscribe` and `unsubscribe` methods.
 * @param arg2 Either a callback function (for subscribing to all events) or event names (string or string[]) to subscribe to specific events.
 * @param arg3 The callback function to be called when events occur (only used when arg2 is event names).
 * @returns A cleanup function that when called will unsubscribe the callback.
 */
export function subscribe<T>(
  emitter: Subscribable<T>,
  arg2: ((data: T) => void) | string | string[],
  arg3?: (data: T) => void,
): () => void {
  if ((Array.isArray(arg2) || typeof arg2 === 'string') && arg3) {
    const subscribePromise = emitter.subscribe(arg2, arg3);
    return () => {
      subscribePromise
        .then(() => {
          emitter.unsubscribe(arg3);
        })
        .catch((error: unknown) => {
          console.error('Error subscribing to events:', error);
        });
    };
  } else if (typeof arg2 === 'function') {
    const subscribePromise = emitter.subscribe(arg2);
    return () => {
      subscribePromise
        .then(() => {
          emitter.unsubscribe(arg2);
        })
        .catch((error: unknown) => {
          console.error('Error subscribing to events:', error);
        });
    };
  } else {
    throw new TypeError('Invalid arguments passed to subscribe()');
  }
}
