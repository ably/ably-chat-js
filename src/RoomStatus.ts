import * as Ably from 'ably';

import { Logger } from './logger.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * The different states that the room can be in.
 */
export enum RoomStatus {
  /**
   * A temporary state for when the library is first initialised.
   */
  Initialized = 'initialized',

  /**
   * The library is currently attempting to attach the room.
   */
  Attaching = 'attaching',

  /**
   * The room is currently attached and receiving events.
   */
  Attached = 'attached',

  /**
   * The room is currently detaching and will not receive events.
   */
  Detaching = 'detaching',

  /**
   * The room is currently detached and will not receive events.
   */
  Detached = 'detached',

  /**
   * The room is in an extended state of detachment, but will attempt to re-attach when able.
   */
  Suspended = 'suspended',

  /**
   * The room is currently detached and will not attempt to re-attach. User intervention is required.
   */
  Failed = 'failed',
}

/**
 * Represents a change in the status of the room.
 */
export interface RoomStatusChange {
  /**
   * The new status of the room.
   */
  status: RoomStatus;

  /**
   * An error that provides a reason why the room has
   * entered the new status, if applicable.
   */
  error?: Ably.ErrorInfo;
}

/**
 * A function that can be called when the room status changes.
 * @param change The change in status.
 */
export type RoomStatusListener = (change: RoomStatusChange) => void;

/**
 * The response from the `onStatusChange` method.
 */
export interface OnRoomStatusChangeResponse {
  /**
   * Unregisters the listener that was added by the `onStatusChange` method.
   */
  off: () => void;
}

/**
 * Represents the status of a Room.
 */
export interface Status {
  /**
   * The current status of the room.
   */
  get currentStatus(): RoomStatus;

  /**
   * The current error, if any, that caused the room to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the room status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onStatusChange(listener: RoomStatusListener): OnRoomStatusChangeResponse;

  /**
   * Registers a listener that will be called once when the room status changes.
   * @param listener The function to call when the status changes.
   */
  onStatusChangeOnce(listener: RoomStatusListener): void;

  /**
   * Removes all listeners that were added by the `onStatusChange` method.
   */
  offAll(): void;
}

type RoomStatusEventsMap = {
  [key in RoomStatus]: RoomStatusChange;
};

/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class DefaultStatus extends EventEmitter<RoomStatusEventsMap> implements Status {
  private _status: RoomStatus = RoomStatus.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _logger: Logger;

  /**
   * Constructs a new `DefaultStatus` instance.
   * @param logger The logger to use.
   */
  constructor(logger: Logger) {
    super();
    this._logger = logger;
    this._status = RoomStatus.Initialized;
    this._error = undefined;
  }

  /**
   * @inheritdoc
   */
  get currentStatus(): RoomStatus {
    return this._status;
  }

  /**
   * @inheritdoc
   */
  get error(): Ably.ErrorInfo | undefined {
    return this._error;
  }

  /**
   * @inheritdoc
   */
  onStatusChange(listener: RoomStatusListener): OnRoomStatusChangeResponse {
    this.on(listener);

    return {
      off: () => {
        this.off(listener);
      },
    };
  }

  // TODO: Split internal and external listeners
  onStatusChangeOnce(listener: RoomStatusListener): void {
    this.once(listener);
  }

  /**
   * @inheritdoc
   */
  offAll(): void {
    this.off();
  }

  setStatus(change: RoomStatusChange): void {
    this._status = change.status;
    this._error = change.error;
    this._logger.info(`Room status is now ${change.status}`, { error: change.error });
    this.emit(change.status, change);
  }
}
