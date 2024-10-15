import { Logger, Room } from '@ably/chat';

export interface RoomPromise {
  unmount: () => () => void;
}

type UnmountCallback = () => void;
export type RoomResolutionCallback = (room: Room) => UnmountCallback;

class DefaultRoomPromise implements RoomPromise {
  private readonly _roomId?: string;
  private readonly _logger: Logger;
  private readonly _onResolve: RoomResolutionCallback;
  private _onUnmount?: UnmountCallback;
  private _unmounted = false;

  constructor(room: Promise<Room>, onResolve: RoomResolutionCallback, logger: Logger, roomId?: string) {
    this._roomId = roomId;
    this._onResolve = onResolve;
    this._logger = logger;

    this.mount(room).catch(() => {
      this._logger.trace('DefaultRoomPromise(); mount error', { roomId: this._roomId });
    });
  }

  async mount(promise: Promise<Room>): Promise<void> {
    this._logger.debug('DefaultRoomPromise(); mount', { roomId: this._roomId });
    try {
      const room = await promise;
      if (this._unmounted) {
        return;
      }

      this._onUnmount = this._onResolve(room);
    } catch (error) {
      this._logger.error('DefaultRoomPromise(); mount error', { roomId: this._roomId, error });
    }
  }

  unmount() {
    if (this._unmounted) {
      return () => {
        // noop
      };
    }

    return () => {
      this._logger.debug('DefaultRoomPromise(); unmount', { roomId: this._roomId });
      this._unmounted = true;
      this._onUnmount?.();
    };
  }
}

export function wrapRoomPromise(
  room: Promise<Room>,
  onResolve: RoomResolutionCallback,
  logger: Logger,
  id?: string,
): RoomPromise {
  return new DefaultRoomPromise(room, onResolve, logger, id);
}

export function wrapRoomPromiseWithUnmountError(
  room: Promise<Room>,
  onResolve: RoomResolutionCallback,
  logger: Logger,
  id?: string,
): RoomPromise {
  return new DefaultRoomPromise(room, onResolve, logger, id);
}
