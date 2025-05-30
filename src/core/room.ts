import * as Ably from 'ably';
import cloneDeep from 'lodash.clonedeep';

import { ChannelManager } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { DiscontinuityListener } from './discontinuity.js';
import { Logger } from './logger.js';
import { DefaultMessages, Messages } from './messages.js';
import { DefaultMessageReactions } from './messages-reactions.js';
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
   *
   * @returns The room name.
   */
  get name(): string;

  /**
   * Allows you to send, subscribe-to and query messages in the room.
   *
   * @returns The messages instance for the room.
   */
  get messages(): Messages;

  /**
   * Allows you to subscribe to presence events in the room.
   *
   * @returns The presence instance for the room.
   */
  get presence(): Presence;

  /**
   * Allows you to interact with room-level reactions.
   *
   * @returns The room reactions instance for the room.
   */
  get reactions(): RoomReactions;

  /**
   * Allows you to interact with typing events in the room.
   *
   * @returns The typing instance for the room.
   */
  get typing(): Typing;

  /**
   * Allows you to interact with occupancy metrics for the room.
   *
   * @returns The occupancy instance for the room.
   */
  get occupancy(): Occupancy;

  /**
   * The current status of the room.
   *
   * @returns The current status.
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
  onStatusChange(listener: RoomStatusListener): StatusSubscription;

  /**
   * Attaches to the room to receive events in realtime.
   *
   * If a room fails to attach, it will enter either the {@link RoomStatus.Suspended} or {@link RoomStatus.Failed} state.
   *
   * If the room enters the failed state, then it will not automatically retry attaching and intervention is required.
   *
   * If the room enters the suspended state, then the call to attach will reject with the {@link ErrorInfo} that caused the suspension. However,
   * the room will automatically retry attaching after a delay.
   *
   * @returns A promise that resolves when the room is attached.
   */
  attach(): Promise<void>;

  /**
   * Detaches from the room to stop receiving events in realtime.
   *
   * @returns A promise that resolves when the room is detached.
   */
  detach(): Promise<void>;

  /**
   * Returns the room options.
   *
   * @returns A copy of the options used to create the room.
   */
  options(): RoomOptions;

  /**
   * Registers a handler that will be called whenever a discontinuity is detected in the room's connection.
   * A discontinuity occurs when the room's connection is interrupted and cannot be resumed from its previous state.
   *
   * @param handler The function to call when a discontinuity is detected.
   * @returns An object that can be used to unregister the handler.
   */
  onDiscontinuity(handler: DiscontinuityListener): StatusSubscription;

  /**
   * Get the underlying Ably realtime channel used for the room.
   * @returns The realtime channel.
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
   *
   * @param name The unique identifier of the room.
   * @param nonce A random identifier for the room instance, useful in debugging and logging.
   * @param options The options for the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   * @param connection An instance of the Connection.
   */
  constructor(
    name: string,
    nonce: string,
    options: InternalRoomOptions,
    realtime: Ably.Realtime,
    chatApi: ChatApi,
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
    this._messages = new DefaultMessages(
      name,
      options.messages,
      channel,
      this._chatApi,
      realtime.auth.clientId,
      this._logger,
    );
    this._presence = new DefaultPresence(channel, realtime.auth.clientId, this._logger, options);
    this._typing = new DefaultTyping(
      options.typing,
      realtime.connection,
      channel,
      realtime.auth.clientId,
      this._logger,
    );
    this._reactions = new DefaultRoomReactions(channel, realtime.connection, realtime.auth.clientId, this._logger);
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

      // Dispose of all remaining resources only once we have fully released the room
      await this._typing.dispose();

      finalized = true;
    };
  }

  /**
   * Gets the channel manager for the room, which handles merging channel options together and creating channels.
   *
   * @param options The room options.
   * @param realtime  An instance of the Ably Realtime client.
   * @param logger An instance of the Logger.
   */
  private _getChannelManager(options: InternalRoomOptions, realtime: Ably.Realtime, logger: Logger): ChannelManager {
    const manager = new ChannelManager(this._name, realtime, logger, options.isReactClient);

    manager.mergeOptions(DefaultOccupancy.channelOptionMerger(options));
    manager.mergeOptions(DefaultPresence.channelOptionMerger(options));
    manager.mergeOptions(DefaultMessageReactions.channelOptionMerger(options));
    return manager;
  }

  /**
   * @inheritdoc Room
   */
  get name(): string {
    return this._name;
  }

  /**
   * @inheritDoc Room
   */
  options(): RoomOptions {
    return cloneDeep(this._options);
  }

  /**
   * @inheritdoc Room
   */
  get messages(): Messages {
    return this._messages;
  }

  /**
   * @inheritdoc Room
   */
  get presence(): Presence {
    return this._presence;
  }

  /**
   * @inheritdoc Room
   */
  get reactions(): RoomReactions {
    return this._reactions;
  }

  /**
   * @inheritdoc Room
   */
  get typing(): Typing {
    return this._typing;
  }

  /**
   * @inheritdoc Room
   */
  get occupancy(): Occupancy {
    return this._occupancy;
  }

  /**
   * @inheritdoc Room
   */
  get status(): RoomStatus {
    return this._lifecycle.status;
  }

  /**
   * @inheritdoc Room
   */
  get error(): Ably.ErrorInfo | undefined {
    return this._lifecycle.error;
  }

  /**
   * @inheritdoc Room
   */
  onStatusChange(listener: RoomStatusListener): StatusSubscription {
    return this._lifecycle.onChange(listener);
  }

  /**
   * @inheritdoc Room
   */
  async attach() {
    this._logger.trace('Room.attach();');
    return this._lifecycleManager.attach();
  }

  /**
   * @inheritdoc Room
   */
  async detach(): Promise<void> {
    this._logger.trace('Room.detach();');
    return this._lifecycleManager.detach();
  }

  /**
   * Releases resources associated with the room.
   * We guarantee that this does not throw an error.
   */
  release(): Promise<void> {
    this._logger.trace('Room.release();');
    return this._finalizer();
  }

  /**
   * A random identifier for the room instance, useful in debugging and logging.
   *
   * @returns The nonce.
   */
  get nonce(): string {
    return this._nonce;
  }

  /**
   * @internal
   *
   * Returns the rooms lifecycle.
   */
  get lifecycle(): InternalRoomLifecycle {
    return this._lifecycle;
  }

  /**
   * @internal
   */
  get lifecycleManager(): RoomLifecycleManager {
    return this._lifecycleManager;
  }

  /**
   * @inheritdoc Room
   */
  onDiscontinuity(handler: DiscontinuityListener): StatusSubscription {
    this._logger.trace('Room.onDiscontinuity();');
    return this._lifecycleManager.onDiscontinuity(handler);
  }

  /**
   * @inheritdoc Room
   */
  get channel(): Ably.RealtimeChannel {
    return this._channelManager.get();
  }
}
