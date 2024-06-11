import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { ClientOptions } from './config.js';
import { Logger } from './logger.js';
import { DefaultMessages, Messages } from './Messages.js';
import { DefaultOccupancy, Occupancy } from './Occupancy.js';
import { DefaultPresence, Presence } from './Presence.js';
import { DefaultRoomReactions, RoomReactions } from './RoomReactions.js';
import { DefaultSubscriptionManager } from './SubscriptionManager.js';
import { DefaultTypingIndicator, TypingIndicators } from './TypingIndicator.js';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

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
   * Allows you to interact with typing indicators in the room.
   *
   * @returns The typing indicators instance for the room.
   */
  get typingIndicators(): TypingIndicators;

  /**
   * Allows you to interact with occupancy metrics for the room.
   *
   * @returns The occupancy instance for the room.
   */
  get occupancy(): Occupancy;
}

export class DefaultRoom implements Room {
  private readonly _roomId: string;
  private readonly chatApi: ChatApi;
  private readonly _messages: Messages;
  private readonly _typingIndicators: TypingIndicators;
  private readonly _presence: Presence;
  private readonly _reactions: RoomReactions;
  private readonly _occupancy: Occupancy;
  private readonly _logger: Logger;

  /**
   * Constructs a new Room instance.
   *
   * @param roomId The unique identifier of the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param clientOptions The client options from the chat instance.
   */
  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi, clientOptions: ClientOptions, logger: Logger) {
    this._roomId = roomId;
    this.chatApi = chatApi;
    const messagesChannelName = `${this._roomId}::$chat::$chatMessages`;

    const subscriptionManager = new DefaultSubscriptionManager(
      realtime.channels.get(messagesChannelName, DEFAULT_CHANNEL_OPTIONS),
      logger,
    );
    this._messages = new DefaultMessages(roomId, subscriptionManager, this.chatApi, realtime.auth.clientId, logger);
    this._presence = new DefaultPresence(subscriptionManager, realtime.auth.clientId, logger);
    this._typingIndicators = new DefaultTypingIndicator(
      roomId,
      realtime,
      realtime.auth.clientId,
      clientOptions.typingTimeoutMs,
      logger,
    );

    const reactionsManagedChannel = new DefaultSubscriptionManager(
      realtime.channels.get(`${this._roomId}::$chat::$reactions`, DEFAULT_CHANNEL_OPTIONS),
      logger,
    );
    this._reactions = new DefaultRoomReactions(roomId, reactionsManagedChannel, realtime.auth.clientId, logger);
    this._occupancy = new DefaultOccupancy(roomId, subscriptionManager, this.chatApi, logger);
    this._logger = logger;
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
  get typingIndicators(): TypingIndicators {
    return this._typingIndicators;
  }

  /**
   * @inheritdoc Room
   */
  get occupancy(): Occupancy {
    return this._occupancy;
  }
}
