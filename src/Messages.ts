import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { MessageEvents } from './events.js';
import { DefaultMessage, Message } from './Message.js';
import EventEmitter from './utils/EventEmitter.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import { PaginatedResult } from './query.js';

interface MessageEventsMap {
  [MessageEvents.created]: MessageEventPayload;
}

/**
 * A direction to query messages in a chat room.
 */
export enum Direction {
  /**
   * Query messages from the start of the time window to the end.
   */
  forwards = 'forwards',

  /**
   * Query messages from the end of the time window to the start.
   */
  backwards = 'backwards',
}

/**
 * Options for querying messages in a chat room.
 */
export interface QueryOptions {
  /**
   * The start of the time window to query from. If provided, the response will include
   * messages with timestamps equal to or greater than this value.
   *
   * @defaultValue The beginning of time
   */
  start?: number;

  /**
   * The end of the time window to query from. If provided, the response will include
   * messages with timestamps less than this value.
   *
   * @defaultValue Now
   */
  end?: number;

  /**
   * The maximum number of messages to return in the response.
   *
   * @defaultValue 100
   */
  limit?: number;

  /**
   * The direction to query messages in.
   *
   * @defaultValue forwards
   */
  direction?: keyof typeof Direction;
}

/**
 * Payload for a message event.
 */
export interface MessageEventPayload {
  /**
   * The type of the message event.
   */
  type: MessageEvents;

  /**
   * The message that was received.
   */
  message: Message;
}

/**
 * A listener for message events in a chat room.
 * @param event The message event that was received.
 */
export type MessageListener = (event: MessageEventPayload) => void;

/**
 * This class is used to interact with messages in a chat room including subscribing
 * to them, fetching history, or sending messages.
 */
export interface Messages {
  /**
   * Subscribe to new messages in this chat room. This will implicitly attach the underlying Ably channel.
   * @param listener callback that will be called
   * @returns A promise that resolves to the underlying Ably channel state change.
   */
  subscribe(listener?: MessageListener): Promise<Ably.ChannelStateChange | null>;

  /**
   * Unsubscribe the given listener from all events.
   * @param listener listener to unsubscribe
   * @returns A promise that resolves when the listener has been unsubscribed.
   */
  unsubscribe(listener?: MessageListener): Promise<void>;

  /**
   * Queries the chat room for messages, based on the provided query options.
   *
   * @param options Options for the query.
   * @returns A promise that resolves with the paginated result of messages. This paginated result can
   * be used to fetch more messages if available.
   */
  query(options: QueryOptions): Promise<PaginatedResult<Message>>;

  /**
   * Send a message in the chat room.
   *
   * This method uses the Ably Chat API endpoint for sending messages.
   *
   * Note that the Promise may resolve before OR after the message is received
   * from the realtime channel. This means you may see the message that was just
   * sent in a callback to `subscribe` before the returned promise resolves.
   *
   * @param text content of the message
   * @returns A promise that resolves when the message was published.
   */
  send(text: string): Promise<Message>;

  /**
   * Get the full name of the Ably realtime channel used for the messages in this
   * chat room.
   *
   * @returns the channel name
   */
  get realtimeChannelName(): string;

  /**
   * Get the underlying Ably realtime channel used for the messages in this chat room.
   *
   * @returns the realtime channel
   */
  get channel(): Ably.RealtimeChannel;
}

/**
 * This class is used to interact with messages in a chat room including subscribing
 * to them, fetching history, or sending messages.
 *
 * Get an instance via room.messages.
 */
export class DefaultMessages extends EventEmitter<MessageEventsMap> implements Messages {
  private readonly roomId: string;
  private readonly _managedChannel: SubscriptionManager;
  private readonly chatApi: ChatApi;
  private readonly clientId: string;
  private _internalListener: Ably.messageCallback<Ably.InboundMessage> | undefined;

  constructor(roomId: string, managedChannel: SubscriptionManager, chatApi: ChatApi, clientId: string) {
    super();
    this.roomId = roomId;
    this._managedChannel = managedChannel;
    this.chatApi = chatApi;
    this.clientId = clientId;
  }

  /**
   * @inheritdoc Messages
   */
  get realtimeChannelName(): string {
    return `${this.roomId}::$chat::$chatMessages`;
  }

  /**
   * @inheritdoc Messages
   */
  get channel(): Ably.RealtimeChannel {
    return this._managedChannel.channel;
  }

  /**
   * @inheritdoc Messages
   */
  async query(options: QueryOptions): Promise<PaginatedResult<Message>> {
    return this.chatApi.getMessages(this.roomId, options);
  }

  /**
   * @inheritdoc Messages
   */
  async send(text: string): Promise<Message> {
    const response = await this.chatApi.sendMessage(this.roomId, text);

    return new DefaultMessage(response.timeserial, this.clientId, this.roomId, text, response.createdAt);
  }

  /**
   * @inheritdoc Messages
   */
  subscribe(listener: MessageListener): Promise<Ably.ChannelStateChange | null> {
    const hasListeners = this.hasListeners();
    super.on([MessageEvents.created], listener);

    if (!hasListeners) {
      this._internalListener = this.processEvent.bind(this);
      return this._managedChannel.subscribe([MessageEvents.created], this._internalListener!);
    }

    return this._managedChannel.channel.attach();
  }

  /**
   * @inheritdoc Messages
   */
  unsubscribe(listener: MessageListener): Promise<void> {
    super.off(listener);
    if (this.hasListeners()) {
      return Promise.resolve();
    }

    return this._managedChannel.unsubscribe(this._internalListener!);
  }

  private processEvent(channelEventMessage: Ably.InboundMessage) {
    const { name } = channelEventMessage;

    // Send the message to the listeners
    switch (name) {
      case MessageEvents.created: {
        const message = this.validateNewMessage(channelEventMessage);
        this.emit(MessageEvents.created, { type: name, message: message });
        return true;
      }
      default:
        throw new Ably.ErrorInfo(`received illegal event="${name}"`, 50000, 500);
    }
  }

  /**
   * Validate the realtime message and convert it to a chat message.
   */
  private validateNewMessage(channelEventMessage: Ably.InboundMessage): Message {
    const { data, clientId, timestamp, extras } = channelEventMessage;

    if (!data) {
      throw new Ably.ErrorInfo(`received message without data`, 50000, 500);
    }

    if (!clientId) {
      throw new Ably.ErrorInfo(`received message without clientId`, 50000, 500);
    }

    if (!timestamp) {
      throw new Ably.ErrorInfo(`received message without timestamp`, 50000, 500);
    }

    const { content } = data;
    if (!content) {
      throw new Ably.ErrorInfo(`received message without content`, 50000, 500);
    }

    if (!extras) {
      throw new Ably.ErrorInfo(`received message without extras`, 50000, 500);
    }

    const { timeserial } = extras;
    if (!timeserial) {
      throw new Ably.ErrorInfo(`received message without timeserial`, 50000, 500);
    }

    return new DefaultMessage(timeserial, clientId, this.roomId, content, timestamp);
  }
}
