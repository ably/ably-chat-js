import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { NormalisedClientOptions } from './config.js';
import { Logger } from './logger.js';
import { DefaultMessages, Messages } from './Messages.js';
import { DefaultOccupancy, Occupancy } from './Occupancy.js';
import { DefaultPresence, Presence } from './Presence.js';
import { RoomLifecycleManager } from './RoomLifecycleManager.js';
import { DefaultRoomReactions, RoomReactions } from './RoomReactions.js';
import { DefaultStatus, Status } from './RoomStatus.js';
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
   * Returns an object that can be used to observe the status of the room.
   *
   * @returns The status observable.
   */
  get status(): Status;

  /**
   * Attaches to the room to receive events in realtime.
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
}

export class DefaultRoom implements Room {
  private readonly _roomId: string;
  private readonly chatApi: ChatApi;
  private readonly _messages: Messages;
  private readonly _typing: Typing;
  private readonly _presence: Presence;
  private readonly _reactions: RoomReactions;
  private readonly _occupancy: Occupancy;
  private readonly _logger: Logger;
  private readonly _status: DefaultStatus;
  private readonly _lifecycleManager: RoomLifecycleManager;

  /**
   * Constructs a new Room instance.
   *
   * @param roomId The unique identifier of the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param clientOptions The client options from the chat instance.
   */
  constructor(
    roomId: string,
    realtime: Ably.Realtime,
    chatApi: ChatApi,
    clientOptions: NormalisedClientOptions,
    logger: Logger,
  ) {
    this._roomId = roomId;
    this.chatApi = chatApi;
    this._logger = logger;
    this._status = new DefaultStatus(logger);

    this._messages = new DefaultMessages(roomId, realtime, this.chatApi, realtime.auth.clientId, logger);
    this._presence = new DefaultPresence(roomId, realtime, realtime.auth.clientId, logger);
    this._typing = new DefaultTyping(roomId, realtime, realtime.auth.clientId, clientOptions.typingTimeoutMs, logger);
    this._reactions = new DefaultRoomReactions(roomId, realtime, realtime.auth.clientId, logger);
    this._occupancy = new DefaultOccupancy(roomId, realtime, this.chatApi, logger);

    const features = [this._messages, this._presence, this._typing, this._reactions, this._occupancy];
    this._lifecycleManager = new RoomLifecycleManager(this._status, features, logger, 5000);
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
  get roomId(): string {
    return this._roomId;
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
  get status(): Status {
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
}
