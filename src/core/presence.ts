import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import { ErrorCode } from './errors.js';
import { PresenceEventType } from './events.js';
import { JsonObject } from './json.js';
import { Logger } from './logger.js';
import { on, subscribe } from './realtime-subscriptions.js';
import { InternalRoomOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * The state of presence in a room
 */
export interface PresenceState {
  /**
   * Whether the current user is present in the room
   */
  readonly present: boolean;
}

/**
 * A presence state change event
 */
export interface PresenceStateChange {
  /**
   * The presence state before this change
   */
  readonly previous: PresenceState;

  /**
   * The presence state after this change
   */
  readonly current: PresenceState;

  /**
   * Any error that occurred during this state change
   * This will be set if there was an error fetching presence data or performing presence operations
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * Listener for presence state changes
 */
export type PresenceStateChangeListener = (change: PresenceStateChange) => void;

/**
 * Interface for PresenceEventsMap
 */
interface PresenceEventsMap {
  [PresenceEventType.Enter]: PresenceEvent;
  [PresenceEventType.Leave]: PresenceEvent;
  [PresenceEventType.Update]: PresenceEvent;
  [PresenceEventType.Present]: PresenceEvent;
}

/**
 * Type for data that can be entered into presence as an object literal.
 * @example
 * ```ts
 * const foo: PresenceData = {
 *   bar: {
 *     baz: 1
 *   }
 * }
 * ```
 * @example
 * ```ts
 * // Defining a custom type for presence data. It must be a JSON serializable object.
 * interface MyPresenceData {
 *   [key: string]: JsonValue; // Type check for JSON compatibility.
 *   foo: string;
 *   bar: {
 *     baz: string;
 *   }
 *  }
 * ```
 */
export type PresenceData = JsonObject;

/**
 * Type for PresenceEvent
 */
export interface PresenceEvent {
  /**
   * The type of the presence event.
   */
  type: PresenceEventType;

  /**
   * The presence member associated with this event.
   */
  member: PresenceMember;
}

/**
 * Type for PresenceMember.
 *
 * Presence members are unique based on their `connectionId` and `clientId`. It is possible for
 * multiple users to have the same `clientId` if they are connected to the room from different devices.
 */
export type PresenceMember = Omit<Ably.PresenceMessage, 'id' | 'action' | 'timestamp'> & {
  /**
   * The timestamp of when the last change in state occurred for this presence member.
   */
  updatedAt: Date;

  /**
   * The data associated with the presence member.
   */
  data: PresenceData | undefined;

  /**
   * The extras associated with the presence member.
   */
  extras: JsonObject | undefined;
};

/**
 * Type for PresenceListener
 * @param event The presence event that was received.
 */
export type PresenceListener = (event: PresenceEvent) => void;

/**
 * This interface is used to interact with presence in a chat room: subscribing to presence events,
 * fetching presence members, or sending presence events (join,update,leave).
 *
 * Get an instance via {@link Room.presence}.
 */
export interface Presence {
  /**
   * Method to get list of the current online users and returns the latest presence messages associated to it.
   * @param params - Parameters that control how the presence set is retrieved.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]>;

  /**
   * Method to check if user with supplied clientId is online
   * @param clientId - The client ID to check if it is present in the room.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  isUserPresent(clientId: string): Promise<boolean>;

  /**
   * Method to join room presence, will emit an enter event to all subscribers. Repeat calls will trigger more enter events.
   * @param data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  enter(data?: PresenceData): Promise<void>;

  /**
   * Method to update room presence, will emit an update event to all subscribers. If the user is not present, it will be treated as a join event.
   * @param data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  update(data?: PresenceData): Promise<void>;

  /**
   * Method to leave room presence, will emit a leave event to all subscribers. If the user is not present, it will be treated as a no-op.
   * @param data - The users data, a JSON serializable object that will be sent to all subscribers.
   * @throws If the room is not in the `attached` or `attaching` state.
   * @returns or upon failure, the promise will be rejected with an {@link Ably.ErrorInfo} object which explains the error.
   */
  leave(data?: PresenceData): Promise<void>;

  /**
   * Subscribe the given listener to all presence events.
   *
   * Note: This requires presence events to be enabled via the `enableEvents` option in
   * the {@link PresenceOptions} provided to the room. If this is not enabled, an error will be thrown.
   * @param listener listener to subscribe
   * @throws An {@link Ably.ErrorInfo} with code 40000 if presence events are not enabled
   */
  subscribe(listener: PresenceListener): Subscription;
}

/**
 * @inheritDoc
 */
export class DefaultPresence implements Presence {
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<PresenceEventsMap>();
  private readonly _stateEmitter = new EventEmitter<{ 'presence.state.change': PresenceStateChange }>();
  private readonly _options: InternalRoomOptions;
  private _presenceState: PresenceState = {
    present: false,
  };
  private readonly _unsubscribePresenceEvents: () => void;
  private readonly _offChannelUpdate: () => void;
  private readonly _offChannelDetach: () => void;

  /**
   * Constructs a new `DefaultPresence` instance.
   * @param channel The Realtime channel instance.
   * @param logger An instance of the Logger.
   * @param options The room options.
   */
  constructor(channel: Ably.RealtimeChannel, logger: Logger, options: InternalRoomOptions) {
    this._channel = channel;
    this._logger = logger;
    this._options = options;

    // Create bound listener
    const presenceEventsListener = this.subscribeToEvents.bind(this);

    const channelUpdateListener = (stateChange: Ably.ChannelStateChange) => {
      if (stateChange.reason?.code === 91004) {
        // PresenceAutoReentryFailed
        this._logger.debug('Presence auto-reentry failed', { reason: stateChange.reason });
        this._emitPresenceStateChange(false, stateChange.reason);
        return;
      }

      // Channel has been moved to detached, which means any members we have will be removed
      if (stateChange.current === 'detached') {
        this._emitPresenceStateChange(false);
        return;
      }
    };

    const channelDetachListener = (stateChange: Ably.ChannelStateChange) => {
      this._emitPresenceStateChange(false, stateChange.reason);
    };

    this._offChannelUpdate = on(this._channel, 'update', channelUpdateListener);
    this._offChannelDetach = on(this._channel, ['detached', 'failed'], channelDetachListener);

    // Use subscription helper to create cleanup function
    this._unsubscribePresenceEvents = subscribe(this._channel.presence, presenceEventsListener);
  }

  /**
   * @inheritDoc
   */
  async get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]> {
    this._logger.trace('Presence.get()', { params });
    this._assertChannelState();
    const userOnPresence = await this._channel.presence.get(params);

    // ably-js never emits the 'absent' event, so we can safely ignore it here.
    return userOnPresence.map((user) => this._realtimeMemberToPresenceMember(user));
  }

  /**
   * @inheritDoc
   */
  async isUserPresent(clientId: string): Promise<boolean> {
    this._logger.trace(`Presence.isUserPresent()`, { clientId });
    this._assertChannelState();
    const presenceSet = await this._channel.presence.get({ clientId: clientId });
    return presenceSet.length > 0;
  }

  /**
   * @inheritDoc
   */
  async enter(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.enter()`, { data });
    this._assertChannelState();
    try {
      await this._channel.presence.enter(data);
      this._emitPresenceStateChange(true);
    } catch (error) {
      this._emitPresenceStateChange(false, error as Ably.ErrorInfo);
      throw error;
    }
  }

  /**
   * @inheritDoc
   */
  async update(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.update()`, { data });
    this._assertChannelState();
    try {
      await this._channel.presence.update(data);
      this._emitPresenceStateChange(true);
    } catch (error) {
      this._emitPresenceStateChange(false, error as Ably.ErrorInfo);
      throw error;
    }
  }

  /**
   * @inheritDoc
   */
  async leave(data?: PresenceData): Promise<void> {
    this._logger.trace(`Presence.leave()`, { data });
    this._assertChannelState();
    try {
      await this._channel.presence.leave(data);
      this._emitPresenceStateChange(false);
    } catch (error) {
      this._emitPresenceStateChange(false, error as Ably.ErrorInfo);
      throw error;
    }
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: PresenceListener): Subscription {
    this._logger.trace('Presence.subscribe()');

    // Check if presence events are enabled
    if (!this._options.presence.enableEvents) {
      this._logger.error('could not subscribe to presence; presence events are not enabled');
      throw new Ably.ErrorInfo(
        'could not subscribe to presence; presence events are not enabled',
        ErrorCode.FeatureNotEnabledInRoom,
        400,
      );
    }

    const wrapped = wrap(listener);
    this._emitter.on(wrapped);
    return {
      unsubscribe: () => {
        this._logger.trace('Presence.unsubscribe();');
        this._emitter.off(wrapped);
      },
    };
  }

  /**
   * Method to handle and emit presence events
   * @param member - PresenceMessage ably-js object
   */
  subscribeToEvents = (member: Ably.PresenceMessage) => {
    this._emitter.emit(member.action as PresenceEventType, {
      type: member.action as PresenceEventType,
      member: this._realtimeMemberToPresenceMember(member),
    });
  };

  /**
   * Merges the channel options for the room with the ones required for presence.
   * @param roomOptions The room options to merge for.
   * @returns A function that merges the channel options for the room with the ones required for presence.
   */
  static channelOptionMerger(roomOptions: InternalRoomOptions): ChannelOptionsMerger {
    return (options) => {
      // Presence mode is always required
      if (!options.modes.includes('PRESENCE')) {
        options.modes.push('PRESENCE');
      }
      // If presence events are enabled, add the PRESENCE_SUBSCRIBE mode
      if (roomOptions.presence.enableEvents && !options.modes.includes('PRESENCE_SUBSCRIBE')) {
        options.modes.push('PRESENCE_SUBSCRIBE');
      }
      return options;
    };
  }

  /**
   * Disposes of the presence instance, removing all listeners and subscriptions.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    this._logger.trace('DefaultPresence.dispose();');

    // Remove all user-level listeners from the emitter
    this._emitter.off();

    // Unsubscribe from presence events using stored unsubscribe function
    this._unsubscribePresenceEvents();

    // Remove the channel update listener
    this._offChannelUpdate();

    // Remove the channel detach listener
    this._offChannelDetach();

    this._logger.debug('DefaultPresence.dispose(); disposed successfully');
  }

  /**
   * Checks if there are any listeners registered by users.
   * @internal
   * @returns true if there are listeners, false otherwise.
   */
  hasListeners(): boolean {
    return emitterHasListeners(this._emitter);
  }

  /**
   * Converts an Ably presence message to a presence member.
   * @param member The Ably presence message to convert.
   * @returns The presence member.
   */
  private _realtimeMemberToPresenceMember(member: Ably.PresenceMessage): PresenceMember {
    return {
      // Note that we're casting `extras` from ably-js's `any` to our `JsonObject | undefined`; although ably-js's types don't express it we can assume this type per https://sdk.ably.com/builds/ably/specification/main/features/#TP3i.
      ...member,
      data: member.data as PresenceData,
      updatedAt: new Date(member.timestamp),
    };
  }

  private _assertChannelState(): void {
    if (this._channel.state !== 'attaching' && this._channel.state !== 'attached') {
      this._logger.error('could not perform presence operation; room is not attached');
      throw new Ably.ErrorInfo(
        'could not perform presence operation; room is not attached',
        ErrorCode.RoomNotAttached,
        400,
      );
    }
  }

  /**
   * Private method to emit the presence state change event.
   * @param present - Whether the user is present
   * @param error - Optional error information
   */
  private _emitPresenceStateChange(present: boolean, error?: Ably.ErrorInfo): void {
    this._logger.trace('Presence._emitPresenceStateChange()', { present, error });
    const previous: PresenceState = { ...this._presenceState };
    this._presenceState = { present };
    const stateChange: PresenceStateChange = {
      previous,
      current: this._presenceState,
      error,
    };
    this._stateEmitter.emit('presence.state.change', stateChange);
  }

  /**
   * @param listener The listener to subscribe to presence state changes.
   * @returns A subscription that can be used to unsubscribe from presence state changes.
   * @internal
   */
  onPresenceStateChange(listener: PresenceStateChangeListener): Subscription {
    this._logger.trace('Presence.onPresenceStateChange()');
    const wrapped = wrap(listener);
    this._stateEmitter.on('presence.state.change', wrapped);
    return {
      unsubscribe: () => {
        this._logger.trace('Presence.unsubscribeFromPresenceStateChanges()');
        this._stateEmitter.off(wrapped);
      },
    };
  }
}
