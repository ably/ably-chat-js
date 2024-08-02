import * as Ably from 'ably';

import { Logger } from './logger.js';
import EventEmitter from './utils/event-emitter.js';

/**
 * The different states that a room can be in throughout its lifecycle.
 */
export enum RoomLifecycle {
  /**
   * A temporary state for when the library is first initialized.
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
   * The room is in the process of releasing. Attempting to use a room in this state may result in undefined behavior.
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
  current: RoomLifecycle;

  /**
   * The previous status of the room.
   */
  previous: RoomLifecycle;

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
export interface RoomStatus {
  /**
   * The current status of the room.
   */
  get current(): RoomLifecycle;

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
export interface InternalRoomStatus extends RoomStatus {
  /**
   * Registers a listener that will be called once when the room status changes.
   * @param listener The function to call when the status changes.
   */
  onChangeOnce(listener: RoomStatusListener): void;

  /**
   * Sets the status of the room.
   *
   * @param params The new status of the room.
   */
  setStatus(params: NewRoomStatus): void;
}

/**
 * A new room status that can be set.
 */
export interface NewRoomStatus {
  /**
   * The new status of the room.
   */
  status: RoomLifecycle;

  /**
   * An error that provides a reason why the room has
   * entered the new status, if applicable.
   */
  error?: Ably.ErrorInfo;
}

type RoomStatusEventsMap = {
  [key in RoomLifecycle]: RoomStatusChange;
};

/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class DefaultStatus extends EventEmitter<RoomStatusEventsMap> implements InternalRoomStatus {
  private _state: RoomLifecycle = RoomLifecycle.Initialized;
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
    this._state = RoomLifecycle.Initialized;
    this._error = undefined;
  }

  /**
   * @inheritdoc
   */
  get current(): RoomLifecycle {
    return this._state;
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

  setStatus(params: NewRoomStatus): void {
    const change: RoomStatusChange = {
      current: params.status,
      error: params.error,
      previous: this._state,
    };

    this._state = change.current;
    this._error = change.error;
    this._logger.info(`Room status changed`, change);
    this._internalEmitter.emit(change.current, change);
    this.emit(change.current, change);
  }
}
