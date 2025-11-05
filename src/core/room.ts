import * as Ably from 'ably';
import cloneDeep from 'lodash.clonedeep';

import { ChannelManager } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { ClientIdResolver } from './client-id.js';
import { DiscontinuityListener } from './discontinuity.js';
import { Logger } from './logger.js';
import { DefaultMessageReactions } from './message-reactions.js';
import { DefaultMessages, Messages } from './messages.js';
import { DefaultOccupancy, Occupancy } from './occupancy.js';
import { DefaultPresence, Presence } from './presence.js';
import { RoomLifecycleManager } from './room-lifecycle-manager.js';
import { InternalRoomOptions, RoomOptions, validateRoomOptions } from './room-options.js';
import { DefaultRoomReactions, RoomReactions } from './room-reactions.js';
import { DefaultRoomLifecycle, InternalRoomLifecycle, RoomStatus, RoomStatusListener } from './room-status.js';
import { StatusSubscription } from './subscription.js';
import { DefaultTyping, Typing } from './typing.js';

/**
 * Represents a chat room.
 */
export interface Room {
  /**
   * The unique identifier of the room.
   * @returns The room name as provided when the room was created
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('sports-discussion');
   * console.log(`Connected to room: ${room.name}`);
   *
   * // Output: Connected to room: sports-discussion
   * ```
   */
  get name(): string;

  /**
   * Provides access to the messages feature for sending, receiving, and querying chat messages.
   * @returns The Messages instance for this room
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('team-chat');
   *
   * // Access messages feature
   * const { subscribe, send, update, ... } = room.messages;
   *
   * ```
   */
  get messages(): Messages;

  /**
   * Provides access to the presence feature for tracking user presence state.
   * @returns The Presence instance for this room
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('meeting-room');
   *
   * // Access presence feature
   * const { enter, leave, get, ... } = room.presence;
   * ```
   */
  get presence(): Presence;

  /**
   * Provides access to room-level reactions for sending ephemeral reactions.
   * @returns The RoomReactions instance for this room
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('live-stream');
   *
   * // Access room reactions feature
   * const { send, ... } = room.reactions;
   *
   * ```
   */
  get reactions(): RoomReactions;

  /**
   * Provides access to the typing indicators feature for showing who is currently typing.
   * @returns The Typing instance for this room
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('support-chat');
   *
   * // Access typing feature
   * const { keystroke, stop, ... } = room.typing;
   *
   * ```
   */
  get typing(): Typing;

  /**
   * Provides access to room occupancy metrics for tracking connection and presence counts.
   * @returns The Occupancy instance for this room
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('webinar-room');
   *
   * // Access occupancy feature
   * const { get, ... } = room.occupancy;
   * ```
   */
  get occupancy(): Occupancy;

  /**
   * The current lifecycle status of the room.
   * @returns The current RoomStatus value
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('game-lobby');
   *
   * // Check room status
   * if (room.status === RoomStatus.Attached) {
   *   console.log('Room is connected and ready');
   * } else if (room.status === RoomStatus.Failed) {
   *   console.error('Room connection failed');
   * }
   *
   * ```
   */
  get status(): RoomStatus;

  /**
   * The error that caused the room to enter its current status, if any.
   * @returns ErrorInfo if an error caused the current status, undefined otherwise
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('private-chat');
   *
   * if (room.error) {
   *   console.error('Room error:', room.error.message);
   *   console.error('Error code:', room.error.code);
   *
   *   // Handle specific error codes
   *   if (room.error.code === 40300) {
   *     showMessage('Access denied to this room');
   *   } else {
   *     showMessage(`Connection failed: ${room.error.message}`);
   *   }
   * }
   * ```
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener to be notified of room status changes.
   *
   * Status changes indicate the room's connection lifecycle. Use this to
   * monitor room health and handle connection issues over time.
   * @param listener - Callback invoked when the room status changes
   * @returns Subscription object with an unsubscribe method
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, RoomStatus } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('support-chat');
   *
   * // Monitor room status changes
   * const statusSubscription = room.onStatusChange((change) => {
   *   console.log(`Room status: ${change.previous} -> ${change.current}`);
   *   console.log(`Timestamp: ${change.timestamp.toISOString()}`);
   *
   *   // Handle different status transitions
   *   switch (change.current) {
   *     case RoomStatus.Attached:
   *       console.log('Room is now connected');
   *       enableChatUI();
   *       showOnlineIndicator();
   *       break;
   *
   *     case RoomStatus.Attaching:
   *       console.log('Connecting to room...');
   *       showConnectingSpinner();
   *       break;
   *
   *     // Handle other cases as needed
   *   }
   * });
   *
   * // Clean up when done
   * statusSubscription.off();
   * ```
   */
  onStatusChange(listener: RoomStatusListener): StatusSubscription;

  /**
   * Attaches to the room to begin receiving events.
   *
   * Establishes an attachment to the room, enabling message delivery,
   * presence updates, typing, and other events. The room must be
   * attached before non-REST-based operations (like `presence.enter()`) can be performed.
   *
   * **Note**:
   * - If attachment fails, the room enters {@link RoomStatus.Suspended} or {@link RoomStatus.Failed} state.
   * - Suspended rooms automatically retry; Failed rooms require manual intervention.
   * - The promise rejects with an {@link ErrorInfo} for suspended states, but the room will retry attaching after a delay.
   * @returns Promise that resolves when the room is successfully attached, or rejects with:
   * - {@link Ably.ErrorInfo} if the room enters suspended state (auto-retry will occur)
   * - {@link Ably.ErrorInfo} if the room enters failed state (manual intervention required)
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, RoomStatus } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('team-standup');
   *
   * // Attach to room with error handling
   * try {
   *   await room.attach();
   *   console.log('Successfully attached to room');
   *
   *   // Now safe to use room features
   *   await room.presence.enter();
   *
   *   // And subscriptions will start receiving events
   *   room.messages.subscribe((event) => {
   *     console.log('New message:', event.message);
   *   });
   * } catch (error) {
   *   console.error('Failed to attach to room:', error);
   *
   *   // Check current room status
   *   if (room.status === RoomStatus.Suspended) {
   *     console.log('Room suspended, will retry automatically');
   *   } else if (room.status === RoomStatus.Failed) {
   *     console.error('Room failed, manual intervention needed');
   *   }
   * }
   *
   * ```
   */
  attach(): Promise<void>;

  /**
   * Detaches from the room to stop receiving chat events.
   *
   * Subscriptions remain registered but won't receive events until the room is
   * reattached. Use this to gracefully detach when leaving a chat view. This command leaves all
   * subscriptions intact, so they will resume receiving events when the room is reattached.
   * @returns Promise that resolves when the room is successfully detached
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options and attach to it
   * const room = await chatClient.rooms.get('customer-support');
   * await room.attach();
   *
   * // Do chat operations...
   *
   * try {
   *     // Detach from room
   *     await room.detach();
   *     console.log('Successfully detached from room');
   *   } catch (error) {
   *     console.error('Failed to detach from room:', error);
   *   }
   * ```
   */
  detach(): Promise<void>;

  /**
   * Returns a copy of the options used to configure the room.
   *
   * Provides access to all room configuration including presence, typing, reactions,
   * and occupancy settings. The returned object is a deep copy to prevent external
   * modifications to the room's configuration.
   * @returns A deep copy of the room options
   * @example
   * ```typescript
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient = new ChatClient(realtime);
   *
   * // Create room with specific options
   * const room = await chatClient.rooms.get('conference-hall', {
   *   presence: {
   *     enableEvents: true,
   *     syncPresenceOnEntry: true
   *   },
   *   typing: {
   *     heartbeatThrottleMs: 1500
   *   },
   *   occupancy: {
   *     enableEvents: true
   *   },
   *   messages: {
   *     rawMessageReactions: false
   *   }
   * });
   *
   * // Get room options to check configuration
   * const options = room.options();
   *
   * console.log('Room configuration:');
   * console.log('Presence events:', options.presence?.enableEvents);
   * console.log('Typing throttle:', options.typing?.heartbeatThrottleMs);
   * console.log('Occupancy events:', options.occupancy?.enableEvents);
   * ```
   */
  options(): RoomOptions;

  /**
   * Registers a handler for discontinuity events in the room's connection.
   *
   * A discontinuity occurs when the connection is interrupted and cannot resume
   * from its previous state, potentially resulting in missed messages or events.
   * Use this to detect gaps in the event stream and take corrective action.
   *
   * **Note**:
   * - Discontinuities require fetching missed messages via history.
   * - Message subscriptions automatically reset their position on discontinuity, see {@link MessageSubscriptionResponse.historyBeforeSubscribe} for more information.
   * - You should subscribe to discontinuities before attaching to the room.
   * @param handler - Callback invoked when a discontinuity is detected
   * @returns Subscription object with an unsubscribe method
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('critical-updates');
   *
   * // Handle discontinuities to ensure no messages are missed
   * const discontinuitySubscription = room.onDiscontinuity((reason) => {
   *   console.warn('Discontinuity detected:', reason);
   *
   *   // Show warning to user
   *   showDiscontinuityWarning('Connection interrupted - fetching missed messages...');
   *
   *   // You may also want to fetch missed messages to fill gaps during the discontinuity.
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Clean up
   * discontinuitySubscription.off();
   * ```
   */
  onDiscontinuity(handler: DiscontinuityListener): StatusSubscription;

  /**
   * Provides direct access to the underlying Ably Realtime channel.
   *
   * Use this for advanced scenarios requiring direct access to the underlying channel. Directly interacting
   * with the Ably channel can lead to unexpected behavior, and so is generally discouraged.
   * @returns The underlying Ably RealtimeChannel instance
   * @example
   * ```typescript
   * const room = await chatClient.rooms.get('advanced-room');
   *
   * // Access underlying channel for advanced operations
   * const channel = room.channel;
   * ```
   */
  get channel(): Ably.RealtimeChannel;
}

export class DefaultRoom implements Room {
  private readonly _name: string;
  private readonly _options: RoomOptions;
  private readonly _chatApi: ChatApi;
  private readonly _messages: DefaultMessages;
  private readonly _typing: DefaultTyping;
  private readonly _presence: DefaultPresence;
  private readonly _reactions: DefaultRoomReactions;
  private readonly _occupancy: DefaultOccupancy;
  private readonly _logger: Logger;
  private readonly _lifecycle: DefaultRoomLifecycle;
  private readonly _lifecycleManager: RoomLifecycleManager;
  private readonly _finalizer: () => Promise<void>;
  private readonly _channelManager: ChannelManager;

  /**
   * A random identifier for the room instance, useful in debugging and logging.
   */
  private readonly _nonce: string;

  /**
   * Constructs a new Room instance.
   * @param name The unique identifier of the room.
   * @param nonce A random identifier for the room instance, useful in debugging and logging.
   * @param options The options for the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param clientIdResolver An instance of the ClientIdResolver.
   * @param logger An instance of the Logger.
   */
  constructor(
    name: string,
    nonce: string,
    options: InternalRoomOptions,
    realtime: Ably.Realtime,
    chatApi: ChatApi,
    clientIdResolver: ClientIdResolver,
    logger: Logger,
  ) {
    validateRoomOptions(options);
    this._nonce = nonce;

    // Create a logger with room context
    this._logger = logger.withContext({ roomName: name, roomNonce: nonce });
    this._logger.debug('Room();', { options });

    this._name = name;
    this._options = options;
    this._chatApi = chatApi;
    this._lifecycle = new DefaultRoomLifecycle(this._logger);

    const channelManager = (this._channelManager = this._getChannelManager(options, realtime, this._logger));
    const channel = channelManager.get();

    // Setup features
    this._messages = new DefaultMessages(name, options.messages, channel, this._chatApi, this._logger);
    this._presence = new DefaultPresence(channel, this._logger, options);
    this._typing = new DefaultTyping(options.typing, realtime.connection, channel, this._logger);
    this._reactions = new DefaultRoomReactions(channel, realtime.connection, clientIdResolver, this._logger);
    this._occupancy = new DefaultOccupancy(name, channel, this._chatApi, this._logger, options);

    // Set the lifecycle manager last, so it becomes the last thing to find out about channel state changes
    // This is to allow Messages to reset subscription points before users get told of a discontinuity
    this._lifecycleManager = new RoomLifecycleManager(channelManager, this._lifecycle, this._logger);

    // Setup a finalization function to clean up resources
    let finalized = false;
    this._finalizer = async () => {
      // Cycle the channels in the feature and release them from the realtime client
      if (finalized) {
        this._logger.debug('Room.finalizer(); already finalized');
        return;
      }

      // Release via the lifecycle manager
      await this._lifecycleManager.release();

      // Dispose of the lifecycle manager, removing all user-registered listeners from emitters
      // and any listeners that have been registered to the realtime instance
      this._lifecycleManager.dispose();

      // Dispose of all features, removing any listeners that have been subscribed to the realtime instance
      // and also removing any user-level listeners from the emitters
      this._messages.dispose();
      this._presence.dispose();
      this._reactions.dispose();
      this._occupancy.dispose();
      await this._typing.dispose();

      // Dispose of the RoomStatus instance
      this._lifecycle.dispose();

      finalized = true;
    };
  }

  /**
   * Gets the channel manager for the room, which handles merging channel options together and creating channels.
   * @param options The room options.
   * @param realtime  An instance of the Ably Realtime client.
   * @param logger An instance of the Logger.
   * @returns The channel manager instance.
   */
  private _getChannelManager(options: InternalRoomOptions, realtime: Ably.Realtime, logger: Logger): ChannelManager {
    const manager = new ChannelManager(this._name, realtime, logger, options.isReactClient);

    manager.mergeOptions(DefaultOccupancy.channelOptionMerger(options));
    manager.mergeOptions(DefaultPresence.channelOptionMerger(options));
    manager.mergeOptions(DefaultMessageReactions.channelOptionMerger(options));
    return manager;
  }

  /**
   * @inheritdoc
   */
  get name(): string {
    return this._name;
  }

  /**
   * @inheritDoc
   */
  options(): RoomOptions {
    return cloneDeep(this._options);
  }

  /**
   * @inheritdoc
   */
  get messages(): Messages {
    return this._messages;
  }

  /**
   * @inheritdoc
   */
  get presence(): Presence {
    return this._presence;
  }

  /**
   * @inheritdoc
   */
  get reactions(): RoomReactions {
    return this._reactions;
  }

  /**
   * @inheritdoc
   */
  get typing(): Typing {
    return this._typing;
  }

  /**
   * @inheritdoc
   */
  get occupancy(): Occupancy {
    return this._occupancy;
  }

  /**
   * @inheritdoc
   */
  get status(): RoomStatus {
    return this._lifecycle.status;
  }

  /**
   * @inheritdoc
   */
  get error(): Ably.ErrorInfo | undefined {
    return this._lifecycle.error;
  }

  /**
   * @inheritdoc
   */
  onStatusChange(listener: RoomStatusListener): StatusSubscription {
    return this._lifecycle.onChange(listener);
  }

  /**
   * @inheritdoc
   */
  async attach() {
    this._logger.trace('Room.attach();');
    return this._lifecycleManager.attach();
  }

  /**
   * @inheritdoc
   */
  async detach(): Promise<void> {
    this._logger.trace('Room.detach();');
    return this._lifecycleManager.detach();
  }

  /**
   * Releases resources associated with the room.
   * @returns A promise that resolves when the room is released.
   */
  async release(): Promise<void> {
    this._logger.trace('Room.release();');
    return this._finalizer();
  }

  /**
   * A random identifier for the room instance, useful in debugging and logging.
   * @returns The nonce.
   */
  get nonce(): string {
    return this._nonce;
  }

  /**
   * @internal
   * @returns The internal room lifecycle.
   */
  get lifecycle(): InternalRoomLifecycle {
    return this._lifecycle;
  }

  /**
   * @internal
   * @returns The room lifecycle manager.
   */
  get lifecycleManager(): RoomLifecycleManager {
    return this._lifecycleManager;
  }

  /**
   * @inheritdoc
   */
  onDiscontinuity(handler: DiscontinuityListener): StatusSubscription {
    this._logger.trace('Room.onDiscontinuity();');
    return this._lifecycleManager.onDiscontinuity(handler);
  }

  /**
   * @inheritdoc
   */
  get channel(): Ably.RealtimeChannel {
    return this._channelManager.get();
  }
}
