import * as Ably from 'ably';
import cloneDeep from 'lodash.clonedeep';

import { ChannelManager } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { Logger } from './logger.js';
import { DefaultMessages, Messages } from './messages.js';
import { DefaultOccupancy, Occupancy } from './occupancy.js';
import { DefaultPresence, Presence } from './presence.js';
import { ContributesToRoomLifecycle, RoomLifecycleManager } from './room-lifecycle-manager.js';
import { NormalizedRoomOptions, RoomOptions, validateRoomOptions } from './room-options.js';
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
   * @returns The room identifier.
   */
  get roomId(): string;

  /**
   * Allows you to send, subscribe-to and query messages in the room.
   *
   * @returns The messages instance for the room.
   */
  get messages(): Messages;

  /**
   * Allows you to subscribe to presence events in the room.
   *
   * @throws {@link ErrorInfo}} if presence is not enabled for the room.
   * @returns The presence instance for the room.
   */
  get presence(): Presence;

  /**
   * Allows you to interact with room-level reactions.
   *
   * @throws {@link ErrorInfo} if reactions are not enabled for the room.
   * @returns The room reactions instance for the room.
   */
  get reactions(): RoomReactions;

  /**
   * Allows you to interact with typing events in the room.
   *
   * @throws {@link ErrorInfo} if typing is not enabled for the room.
   * @returns The typing instance for the room.
   */
  get typing(): Typing;

  /**
   * Allows you to interact with occupancy metrics for the room.
   *
   * @throws {@link ErrorInfo} if occupancy is not enabled for the room.
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
   * Removes all listeners that were added by the `onStatusChange` method.
   */
  offAllStatusChange(): void;

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
}

export class DefaultRoom implements Room {
  private readonly _roomId: string;
  private readonly _options: RoomOptions;
  private readonly _chatApi: ChatApi;
  private readonly _messages: DefaultMessages;
  private readonly _typing?: DefaultTyping;
  private readonly _presence?: DefaultPresence;
  private readonly _reactions?: DefaultRoomReactions;
  private readonly _occupancy?: DefaultOccupancy;
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
   * @param roomId The unique identifier of the room.
   * @param nonce A random identifier for the room instance, useful in debugging and logging.
   * @param options The options for the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomId: string,
    nonce: string,
    options: NormalizedRoomOptions,
    realtime: Ably.Realtime,
    chatApi: ChatApi,
    logger: Logger,
  ) {
    validateRoomOptions(options);
    this._nonce = nonce;

    // Create a logger with room context
    this._logger = logger.withContext({ roomId, roomNonce: nonce });
    this._logger.debug('Room();', { options });

    this._roomId = roomId;
    this._options = options;
    this._chatApi = chatApi;
    this._lifecycle = new DefaultRoomLifecycle(roomId, this._logger);

    const channelManager = (this._channelManager = this._getChannelManager(options, realtime, this._logger));

    // Setup features
    this._messages = new DefaultMessages(roomId, channelManager, this._chatApi, realtime.auth.clientId, this._logger);

    const features: ContributesToRoomLifecycle[] = [this._messages];

    if (options.presence) {
      this._logger.debug('enabling presence on room');
      this._presence = new DefaultPresence(roomId, channelManager, realtime.auth.clientId, this._logger);
      features.push(this._presence);
    }

    if (options.typing) {
      this._logger.debug('enabling typing on room');
      this._typing = new DefaultTyping(roomId, options.typing, channelManager, realtime.auth.clientId, this._logger);
      features.push(this._typing);
    }

    if (options.reactions) {
      this._logger.debug('enabling reactions on room');
      this._reactions = new DefaultRoomReactions(roomId, channelManager, realtime.auth.clientId, this._logger);
      features.push(this._reactions);
    }

    if (options.occupancy) {
      this._logger.debug('enabling occupancy on room');
      this._occupancy = new DefaultOccupancy(roomId, channelManager, this._chatApi, this._logger);
      features.push(this._occupancy);
    }

    this._lifecycleManager = new RoomLifecycleManager(this._lifecycle, [...features].reverse(), this._logger, 5000);

    // Setup a finalization function to clean up resources
    let finalized = false;
    this._finalizer = async () => {
      // Cycle the channels in the feature and release them from the realtime client
      if (finalized) {
        this._logger.debug('Room.finalizer(); already finalized');
        return;
      }

      await this._lifecycleManager.release();

      for (const feature of features) {
        channelManager.release(feature.channel.name);
      }

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
  private _getChannelManager(options: NormalizedRoomOptions, realtime: Ably.Realtime, logger: Logger): ChannelManager {
    const manager = new ChannelManager(realtime, logger, options.isReactClient);

    if (options.occupancy) {
      manager.mergeOptions(DefaultOccupancy.channelName(this._roomId), DefaultOccupancy.channelOptionMerger());
    }

    if (options.presence) {
      manager.mergeOptions(DefaultPresence.channelName(this._roomId), DefaultPresence.channelOptionMerger(options));
    }

    return manager;
  }

  /**
   * @inheritdoc Room
   */
  get roomId(): string {
    return this._roomId;
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
    if (!this._presence) {
      this._logger.error('Presence is not enabled for this room');
      throw new Ably.ErrorInfo('Presence is not enabled for this room', 40000, 400);
    }

    return this._presence;
  }

  /**
   * @inheritdoc Room
   */
  get reactions(): RoomReactions {
    if (!this._reactions) {
      this._logger.error('Reactions are not enabled for this room');
      throw new Ably.ErrorInfo('Reactions are not enabled for this room', 40000, 400);
    }

    return this._reactions;
  }

  /**
   * @inheritdoc Room
   */
  get typing(): Typing {
    if (!this._typing) {
      this._logger.error('Typing is not enabled for this room');
      throw new Ably.ErrorInfo('Typing is not enabled for this room', 40000, 400);
    }

    return this._typing;
  }

  /**
   * @inheritdoc Room
   */
  get occupancy(): Occupancy {
    if (!this._occupancy) {
      this._logger.error('Occupancy is not enabled for this room');
      throw new Ably.ErrorInfo('Occupancy is not enabled for this room', 40000, 400);
    }

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
  offAllStatusChange(): void {
    this._lifecycle.offAll();
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

  get channelManager(): ChannelManager {
    return this._channelManager;
  }
}
