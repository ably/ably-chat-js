import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { Logger } from './logger.js';
import { DefaultMessages, Messages } from './Messages.js';
import { DefaultOccupancy, Occupancy } from './Occupancy.js';
import { DefaultPresence, Presence } from './Presence.js';
import { ContributesToRoomLifecycle, RoomLifecycleManager } from './RoomLifecycleManager.js';
import { RoomOptions, validateRoomOptions } from './RoomOptions.js';
import { DefaultRoomReactions, RoomReactions } from './RoomReactions.js';
import { DefaultStatus, RoomStatus } from './RoomStatus.js';
import { DefaultTyping, Typing } from './Typing.js';

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
   * Returns an object that can be used to observe the status of the room.
   *
   * @returns The status observable.
   */
  get status(): RoomStatus;

  /**
   * Attaches to the room to receive events in realtime.
   *
   * If a room fails to attach, it will enter either the {@link RoomLifecycle.Suspended} or {@link RoomLifecycle.Failed} state.
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
  private readonly _status: DefaultStatus;
  private readonly _lifecycleManager: RoomLifecycleManager;
  private readonly _finalizer: () => Promise<void>;

  /**
   * Constructs a new Room instance.
   *
   * @param roomId The unique identifier of the room.
   * @param options The options for the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, options: RoomOptions, realtime: Ably.Realtime, chatApi: ChatApi, logger: Logger) {
    validateRoomOptions(options);
    logger.debug('Room();', { roomId, options });

    this._roomId = roomId;
    this._options = options;
    this._chatApi = chatApi;
    this._logger = logger;
    this._status = new DefaultStatus(logger);

    // Setup features
    this._messages = new DefaultMessages(roomId, realtime, this._chatApi, realtime.auth.clientId, logger);
    const features: ContributesToRoomLifecycle[] = [this._messages];
    if (options.presence) {
      this._logger.debug('enabling presence on room', { roomId });
      this._presence = new DefaultPresence(roomId, options, realtime, realtime.auth.clientId, logger);
      features.push(this._presence);
    }

    if (options.typing) {
      this._logger.debug('enabling typing on room', { roomId });
      this._typing = new DefaultTyping(roomId, options.typing, realtime, realtime.auth.clientId, logger);
      features.push(this._typing);
    }

    if (options.reactions) {
      this._logger.debug('enabling reactions on room', { roomId });
      this._reactions = new DefaultRoomReactions(roomId, realtime, realtime.auth.clientId, logger);
      features.push(this._reactions);
    }

    if (options.occupancy) {
      this._logger.debug('enabling occupancy on room', { roomId });
      this._occupancy = new DefaultOccupancy(roomId, realtime, this._chatApi, logger);
      features.push(this._occupancy);
    }

    // Setup lifecycle manager - reverse the features so messages always comes in last
    this._lifecycleManager = new RoomLifecycleManager(this._status, features.toReversed(), logger, 5000);

    // Setup a finalization function to clean up resources
    let finalized = false;
    this._finalizer = async () => {
      // Cycle the channels in the feature and release them from the realtime client
      if (finalized) {
        this._logger.debug('Room.finalizer(); already finalized');
        return;
      }

      await this._lifecycleManager.release();

      features.forEach((feature: ContributesToRoomLifecycle) => {
        realtime.channels.release(feature.channel.name);
      });

      finalized = true;
    };
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
    return structuredClone(this._options);
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
    return this._status;
  }

  /**
   * @inheritdoc Room
   */
  async attach(): Promise<void> {
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
   * @internal
   */
  get lifecycleManager(): RoomLifecycleManager {
    return this._lifecycleManager;
  }
}
