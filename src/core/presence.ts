import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import { ErrorCode } from './errors.js';
import { PresenceEventType } from './events.js';
import { JsonObject } from './json.js';
import { Logger } from './logger.js';
import { realtimeExtras } from './realtime-extensions.js';
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

  /**
   * The user claim attached to this presence event by the server. This is set automatically
   * by the server when a JWT contains a matching `ably.room.<roomName>` claim.
   */
  userClaim?: string;
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
   * Retrieves the current members present in the chat room.
   *
   * **Note**: The room must be attached before calling this method.
   * @param params - Optional parameters to filter the presence set
   * @returns Promise that resolves with an array of presence members currently in the room,
   *          or rejects with {@link ErrorCode.RoomInInvalidState} if the room is not attached
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('meeting-room');
   * await room.attach();
   *
   * try {
   *   // Get all currently present members
   *   const members: PresenceMember[] = await room.presence.get();
   *   console.log(`${members.length} users present in the room`);
   *
   *   members.forEach((member) => {
   *     console.log(`User ${member.clientId} is present with data:`, member.data);
   *   });
   *
   *   // Get members with a specific client ID
   *   const specificUser = await room.presence.get({ clientId: 'user-456' });
   *   if (specificUser.length > 0) {
   *     console.log('User-456 is in the room');
   *   }
   * } catch (error) {
   *   console.error('Failed to get presence members:', error);
   * }
   * ```
   */
  get(params?: Ably.RealtimePresenceParams): Promise<PresenceMember[]>;

  /**
   * Checks whether a specific user is currently present in the chat room.
   * Useful if you just need a boolean check rather than the full presence member data.
   *
   * **Note**: The room must be attached before calling this method.
   * @param clientId - The client ID of the user to check
   * @returns Promise that resolves with true if the user is present, false otherwise, or rejects with:
   * - {@link ErrorCode.RoomInInvalidState} if the room is not attached
   * - {@link Ably.ErrorInfo} if the operation fails for any other reason
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('meeting-room');
   * await room.attach();
   *
   * try {
   *   // Check if a specific user is present
   *   const isPresent: boolean = await room.presence.isUserPresent('user-456');
   *
   *   if (isPresent) {
   *     console.log('User-456 is currently in the room');
   *   } else {
   *     console.log('User-456 is not in the room');
   *   }
   * } catch (error) {
   *   console.error('Failed to check user presence:', error);
   * }
   * ```
   */
  isUserPresent(clientId: string): Promise<boolean>;

  /**
   * Enters the current user into the chat room presence set.
   * Emits an 'enter' event to all presence subscribers. Multiple calls will emit additional `update` events if the
   * user is already present.
   *
   * **Note**: The room must be attached before calling this method.
   * @param data - Optional JSON-serializable data to associate with the user's presence
   * @returns Promise that resolves when the user has successfully entered,
   *          or rejects with {@link ErrorCode.RoomInInvalidState} if the room is not attached
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('meeting-room');
   * await room.attach();
   *
   * try {
   *   // Enter with user metadata
   *   await room.presence.enter({
   *     avatar: 'https://example.com/avatar.jpg',
   *     status: 'online',
   *     role: 'moderator'
   *   });
   *
   *   console.log('Successfully entered the room');
   * } catch (error) {
   *   console.error('Failed to enter room:', error);
   * }
   *
   * ```
   */
  enter(data?: PresenceData): Promise<void>;

  /**
   * Updates the presence data for the current user in the chat room.
   * Emits an 'update' event to all subscribers. If the user is not already present, they will be entered automatically.
   *
   * **Note**:
   * - The room must be attached before calling this method.
   * - This method uses PUT-like semantics - the entire presence data is replaced with the new value.
   * @param data - JSON-serializable data to replace the user's current presence data
   * @returns Promise that resolves when the presence data has been updated,
   *          or rejects with {@link ErrorCode.RoomInInvalidState} if the room is not attached
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('meeting-room');
   * await room.attach();
   *
   * try {
   *   // Initial enter with status
   *   await room.presence.enter({
   *     username: 'John Doe',
   *     status: 'online'
   *   });
   *
   *   // Update status to busy (replaces entire data object)
   *   await room.presence.update({
   *     username: 'John Doe',
   *     status: 'busy',
   *     statusMessage: 'In a meeting'
   *   });
   *
   *   console.log('Presence status updated');
   * } catch (error) {
   *   console.error('Failed to update presence:', error);
   * }
   * ```
   */
  update(data?: PresenceData): Promise<void>;

  /**
   * Removes the current user from the chat room presence set.
   * Emits a 'leave' event to all subscribers. If the user is not present, this is a no-op.
   *
   * **Note**: The room must be attached before calling this method.
   * @param data - Optional final presence data to include with the leave event
   * @returns Promise that resolves when the user has left the presence set,
   *          or rejects with {@link ErrorCode.RoomInInvalidState} if the room is not attached
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('meeting-room');
   * await room.attach();
   *
   * try {
   *   // Enter the room
   *   await room.presence.enter({
   *     avatar: 'https://example.com/avatar.jpg',
   *     status: 'online'
   *   });
   *
   *   // Do some work in the room...
   *
   *   // Leave with a final status message
   *   await room.presence.leave({
   *     status: 'offline',
   *     lastSeen: new Date().toISOString()
   *   });
   *
   *   console.log('Successfully left the room');
   * } catch (error) {
   *   console.error('Failed to leave room:', error);
   * }
   * ```
   */
  leave(data?: PresenceData): Promise<void>;

  /**
   * Subscribes to all presence events in the chat room.
   *
   * **Note**:
   * - Requires `enableEvents` to be true in the room's presence options.
   * - The room must be attached to receive events in real-time.
   * @param listener - Callback function invoked when any presence event occurs
   * @returns Subscription object with an unsubscribe method
   * @throws An {@link Ably.ErrorInfo} with {@link ErrorCode.FeatureNotEnabledInRoom} if presence events are not enabled
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, PresenceEvent, PresenceEventType } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('meeting-room');
   *
   * // Subscribe to all presence events
   * const subscription = room.presence.subscribe((event: PresenceEvent) => {
   *   const { type, member } = event;
   *   switch (type) {
   *     case PresenceEventType.Enter:
   *       console.log(`${member.clientId} entered at ${member.updatedAt}`);
   *       break;
   *     case PresenceEventType.Leave:
   *       console.log(`${member.clientId} left at ${member.updatedAt}`);
   *       break;
   *     case PresenceEventType.Update:
   *       console.log(`${member.clientId} updated their data:`, member.data);
   *       break;
   *     case PresenceEventType.Present:
   *       console.log(`${member.clientId} is already present`);
   *       break;
   *   }
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Later, unsubscribe when done
   * subscription.unsubscribe();
   * ```
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
      this._logger.error('unable to subscribe to presence; presence events are not enabled');
      throw new Ably.ErrorInfo(
        'unable to subscribe to presence; presence events are not enabled',
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
    const extras = realtimeExtras(member.extras);
    return {
      // Note that we're casting `extras` from ably-js's `any` to our `JsonObject | undefined`; although ably-js's types don't express it we can assume this type per https://sdk.ably.com/builds/ably/specification/main/features/#TP3i.
      ...member,
      data: member.data as PresenceData,
      updatedAt: new Date(member.timestamp),
      userClaim: extras.userClaim,
    };
  }

  private _assertChannelState(): void {
    if (this._channel.state !== 'attaching' && this._channel.state !== 'attached') {
      this._logger.error('unable to perform presence operation; room is not attached');
      throw new Ably.ErrorInfo(
        'unable to perform presence operation; room is not attached',
        ErrorCode.RoomInInvalidState,
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
