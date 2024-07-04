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

  /**
   * The room is in the process of releasing. Attempting to use a room in this state may result in undefined behaviour.
   */
  Releasing = 'releasing',

  /**
   * The room has been released and is no longer usable.
   */
  Released = 'released',
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
 * The response from the `onChange` method.
 */
export interface OnRoomStatusChangeResponse {
  /**
   * Unregisters the listener that was added by the `onChange` method.
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
  onChange(listener: RoomStatusListener): OnRoomStatusChangeResponse;

  /**
   * Removes all listeners that were added by the `onChange` method.
   */
  offAll(): void;
}

/**
 * An internal interface for the status of a room, which can be used to separate critical
 * internal functionality from user listeners.
 * @internal
 */
export interface InternalRoomStatus extends Status {
  /**
   * Registers a listener that will be called once when the room status changes.
   * @param listener The function to call when the status changes.
   */
  onChangeOnce(listener: RoomStatusListener): void;
}

type RoomStatusEventsMap = {
  [key in RoomStatus]: RoomStatusChange;
};

/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class DefaultStatus extends EventEmitter<RoomStatusEventsMap> implements Status, InternalRoomStatus {
  private _status: RoomStatus = RoomStatus.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _logger: Logger;
  private readonly _internalEmitter = new EventEmitter<RoomStatusEventsMap>();

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
  onChange(listener: RoomStatusListener): OnRoomStatusChangeResponse {
    this.on(listener);

    return {
      off: () => {
        this.off(listener);
      },
    };
  }

  onChangeOnce(listener: RoomStatusListener): void {
    this._internalEmitter.once(listener);
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
    this._internalEmitter.emit(change.status, change);
    this.emit(change.status, change);
  }
}
