import * as Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Messages, DefaultMessages } from './Messages.js';
import { DefaultPresence, Presence } from './Presence.js';
import { DefaultSubscriptionManager } from './SubscriptionManager.js';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';
import { DefaultTypingIndicator, TypingIndicators } from './TypingIndicator.js';
import { DefaultOccupancy, Occupancy } from './Occupancy.js';
import { ClientOptions } from './config.js';
import { RoomReactions, DefaultRoomReactions } from './RoomReactions.js';

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
  readonly messages: Messages;

  /**
   * Allows you to subscribe to presence events in the room.
   *
   * @returns The presence instance for the room.
   */
  readonly presence: Presence;

  /**
   * Allows you to interact with room-level reactions.
   *
   * @returns The room reactions instance for the room.
   */

  readonly reactions: RoomReactions;

  /**
   * Allows you to interact with typing indicators in the room.
   *
   * @returns The typing indicators instance for the room.
   */

  get typingIndicators(): TypingIndicators;
}

export class DefaultRoom implements Room {
  private readonly _roomId: string;
  private readonly chatApi: ChatApi;
  readonly messages: Messages;
  private readonly _typingIndicators: TypingIndicators;
  readonly presence: Presence;
  readonly reactions: RoomReactions;
  private readonly _occupancy: Occupancy;

  /**
   * Constructs a new Room instance.
   *
   * @param roomId The unique identifier of the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param clientOptions The client options from the chat instance.
   */
  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi, clientOptions: ClientOptions) {
    this._roomId = roomId;
    this.chatApi = chatApi;
    const messagesChannelName = `${this._roomId}::$chat::$chatMessages`;

    const subscriptionManager = new DefaultSubscriptionManager(
      realtime.channels.get(messagesChannelName, DEFAULT_CHANNEL_OPTIONS),
    );
    this.messages = new DefaultMessages(roomId, subscriptionManager, this.chatApi, realtime.auth.clientId);
    this.presence = new DefaultPresence(subscriptionManager, realtime.auth.clientId);
    this._typingIndicators = new DefaultTypingIndicator(
      roomId,
      realtime,
      realtime.auth.clientId,
      clientOptions.typingTimeoutMs,
    );

    const reactionsManagedChannel = new DefaultSubscriptionManager(
      realtime.channels.get(`${this._roomId}::$chat::$reactions`, DEFAULT_CHANNEL_OPTIONS),
    );
    this.reactions = new DefaultRoomReactions(roomId, reactionsManagedChannel, realtime.auth.clientId);
    this._occupancy = new DefaultOccupancy(roomId, subscriptionManager, this.chatApi);
  }

  /**
   * @returns The room identifier.
   */
  get roomId(): string {
    return this._roomId;
  }

  /**
   * @returns The typing indicators instance for the room.
   */
  get typingIndicators(): TypingIndicators {
    return this._typingIndicators;
  }

  get occupancy(): Occupancy {
    return this._occupancy;
  }
}
