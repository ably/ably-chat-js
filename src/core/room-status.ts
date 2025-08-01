import * as Ably from 'ably';

import { Logger } from './logger.js';
import { StatusSubscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * The different states that a room can be in throughout its lifecycle.
 */
export enum RoomStatus {
  /**
   * The library is currently initializing the room. This state is a temporary state used in React prior
   * to the room being resolved.
   */
  Initializing = 'initializing',

  /**
   * A temporary state for when the room object is first initialized.
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
  current: RoomStatus;

  /**
   * The previous status of the room.
   */
  previous: RoomStatus;

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
 * Represents the status of a Room.
 */
export interface RoomLifecycle {
  /**
   * The current status of the room.
   */
  get status(): RoomStatus;

  /**
   * The current error, if any, that caused the room to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the room status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onChange(listener: RoomStatusListener): StatusSubscription;
}

/**
 * An internal interface for the status of a room, which can be used to separate critical
 * internal functionality from user listeners.
 * @internal
 */
export interface InternalRoomLifecycle extends RoomLifecycle {
  /**
   * Sets the status of the room.
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
  status: RoomStatus;

  /**
   * An error that provides a reason why the room has
   * entered the new status, if applicable.
   */
  error?: Ably.ErrorInfo;
}

type RoomStatusEventsMap = Record<RoomStatus, RoomStatusChange>;

/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class DefaultRoomLifecycle implements InternalRoomLifecycle {
  private _status: RoomStatus = RoomStatus.Initialized;
  private _error?: Ably.ErrorInfo;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<RoomStatusEventsMap>();

  /**
   * Constructs a new DefaultRoomLifecycle instance.
   * @param logger An instance of the Logger.
   */
  constructor(logger: Logger) {
    this._logger = logger;
  }

  /**
   * @inheritdoc
   */
  get status(): RoomStatus {
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
  onChange(listener: RoomStatusListener): StatusSubscription {
    const wrapped = wrap(listener);
    this._emitter.on(wrapped);

    return {
      off: () => {
        this._emitter.off(wrapped);
      },
    };
  }

  setStatus(params: NewRoomStatus): void {
    const change: RoomStatusChange = {
      current: params.status,
      error: params.error,
      previous: this._status,
    };

    this._status = change.current;
    this._error = change.error;
    this._logger.info(`room status changed`, { ...change });
    this._emitter.emit(change.current, change);
  }

  /**
   * Disposes of the room lifecycle instance, removing all listeners.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    this._logger.trace('DefaultRoomLifecycle.dispose();');

    // Remove all user-level listeners
    this._emitter.off();

    this._logger.debug('DefaultRoomLifecycle.dispose(); disposed successfully');
  }

  /**
   * Checks if there are any listeners registered by users.
   * @internal
   * @returns true if there are listeners, false otherwise.
   */
  hasListeners(): boolean {
    return emitterHasListeners(this._emitter);
  }
}
