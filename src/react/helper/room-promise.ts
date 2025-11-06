import { Logger } from '../../core/logger.js';
import { Room } from '../../core/room.js';

/**
 * RoomPromise is a wrapper around a promise that resolves to a Room instance.
 *
 * It is designed to better integrate into the React lifecycle, and control whether an unmount
 * function needs to be called depending on where the promise resolution occurs relative to the
 * component lifecycle.
 */
export interface RoomPromise {
  /**
   * Returns a function to be called when the component is unmounted. If the room promise has resolved at the time,
   * of calling, then the unmount function returned by the onResolve callback will be called.
   *
   * Multiple calls are no-op.
   *
   * This should be used in conjunction with React's useEffect hook to ensure that resources are cleaned up.
   * @returns A function that should be called when the component is unmounted.
   * @example
   * ```ts
   * useEffect(() => {
   *   const roomPromise: RoomPromise;
   *   return roomPromise.unmount();
   * }, []);
   */
  unmount: () => () => void;
}

/**
 * A callback that can be returned by the onResolve callback to clean up any resources.
 */
type UnmountCallback = () => void;

/**
 * A callback that is called when the promise resolves to a Room instance.
 */
export type RoomResolutionCallback = (room: Room) => UnmountCallback;

/**
 * Default implementation of RoomPromise.
 */
class DefaultRoomPromise implements RoomPromise {
  private readonly _logger: Logger;
  private readonly _onResolve: RoomResolutionCallback;
  private _onUnmount?: UnmountCallback;
  private _unmounted = false;

  /**
   * Creates a new DefaultRoomPromise and starts the resolution of the promise.
   * @param room  The promise that resolves to a Room instance.
   * @param onResolve  The callback that is called when the promise resolves to a Room instance.
   * @param logger  The logger to use for logging.
   */
  constructor(room: Promise<Room>, onResolve: RoomResolutionCallback, logger: Logger) {
    this._onResolve = onResolve;
    this._logger = logger;

    this.mount(room).catch((error: unknown) => {
      this._logger.trace('DefaultRoomPromise(); mount error', { error: error });
    });
  }

  /**
   * Wait for the room promise to resolve, then execute the onResolve callback, storing its response as an unmount function.
   * If the component is unmounted before the promise resolves, then this will do nothing.
   * @param promise The promise that resolves to a Room instance.
   * @returns A promise that we simply resolve when it's done.
   */
  async mount(promise: Promise<Room>): Promise<void> {
    this._logger.debug('DefaultRoomPromise(); mount');
    try {
      const room = await promise;
      if (this._unmounted) {
        return;
      }

      this._logger.debug('DefaultRoomPromise(); mount resolved');
      this._onUnmount = this._onResolve(room);
    } catch (error) {
      this._logger.error('DefaultRoomPromise(); mount error', { error });
    }
  }

  /**
   * Returns a function to be called when the component is unmounted. If the room promise has resolved at the time
   * of calling, then the unmount function returned by the onResolve callback will be called.
   *
   * Multiple calls are no-op.
   *
   * Example usage:
   *
   * ```ts
   * useEffect(() => {
   * const roomPromise = wrapRoomPromise(...);
   * return roomPromise.unmount();
   * }, []);
   * ```
   * @returns A function that should be called when the component is unmounted.
   */
  unmount() {
    if (this._unmounted) {
      return () => {
        // noop
      };
    }

    return () => {
      this._logger.debug('DefaultRoomPromise(); unmount');
      this._unmounted = true;
      this._onUnmount?.();
    };
  }
}

/**
 * Provides a convenient way to wrap a promise that resolves to a Room instance, and execute a callback.
 * This should be used in conjunction with React's useEffect hook to ensure that resources are cleaned up.
 *
 * Example usage:
 *
 * ```ts
 * useEffect(() => {
 * const roomPromise = wrapRoomPromise(...);
 * return roomPromise.unmount();
 * }, []);
 * ```
 * @internal
 * @param room The promise that resolves to a Room instance.
 * @param onResolve The callback that is called when the promise resolves to a Room instance.
 * @param logger The logger to use for logging.
 * @returns A RoomPromise instance that can be used to clean up resources.
 */
export const wrapRoomPromise = (room: Promise<Room>, onResolve: RoomResolutionCallback, logger: Logger): RoomPromise =>
  new DefaultRoomPromise(room, onResolve, logger);
