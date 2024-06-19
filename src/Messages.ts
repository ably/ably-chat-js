import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { MessageEvents } from './events.js';
import { Logger } from './logger.js';
import { DefaultMessage, Message } from './Message.js';
import { PaginatedResult } from './query.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import EventEmitter from './utils/EventEmitter.js';

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
   * @returns A promise that resolves to the underlying Ably state change.
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
  private readonly _roomId: string;
  private readonly _managedChannel: SubscriptionManager;
  private readonly _chatApi: ChatApi;
  private readonly _clientId: string;
  private readonly _logger: Logger;
  private _internalListener: Ably.messageCallback<Ably.InboundMessage> | undefined;

  constructor(roomId: string, managedChannel: SubscriptionManager, chatApi: ChatApi, clientId: string, logger: Logger) {
    super();
    this._roomId = roomId;
    this._managedChannel = managedChannel;
    this._chatApi = chatApi;
    this._clientId = clientId;
    this._logger = logger;
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
    this._logger.trace('Messages.query();');
    return this._chatApi.getMessages(this._roomId, options);
  }

  /**
   * @inheritdoc Messages
   */
  async send(text: string): Promise<Message> {
    this._logger.trace('Messages.send();');
    const response = await this._chatApi.sendMessage(this._roomId, text);

    return new DefaultMessage(response.timeserial, this._clientId, this._roomId, text, response.createdAt);
  }

  /**
   * @inheritdoc Messages
   */
  subscribe(listener: MessageListener): Promise<Ably.ChannelStateChange | null> {
    this._logger.trace('Messages.subscribe();');
    const hasListeners = this.hasListeners();
    super.on([MessageEvents.created], listener);

    if (!hasListeners) {
      this._logger.debug('Messages.subscribe(); subscribing internal listener');
      this._internalListener = this.processEvent.bind(this);
      return this._managedChannel.subscribe([MessageEvents.created], this._internalListener!);
    }

    return this._managedChannel.channel.attach();
  }

  /**
   * @inheritdoc Messages
   */
  unsubscribe(listener: MessageListener): Promise<void> {
    this._logger.trace('Messages.unsubscribe();');
    super.off(listener);
    if (this.hasListeners()) {
      return Promise.resolve();
    }

    this._logger.debug('Messages.unsubscribe(); unsubscribing internal listener');
    return this._managedChannel.unsubscribe(this._internalListener!);
  }

  private processEvent(channelEventMessage: Ably.InboundMessage) {
    this._logger.trace('Messages.processEvent();', {
      channelEventMessage,
    });
    const { name } = channelEventMessage;

    // Send the message to the listeners
    switch (name) {
      case MessageEvents.created: {
        const message = this.parseNewMessage(channelEventMessage);
        if (!message) {
          return;
        }

        this.emit(MessageEvents.created, { type: name, message: message });
        break;
      }
      default:
        this._logger.warn('Messages.processEvent(); received unknown event', { name });
    }
  }

  /**
   * Validate the realtime message and convert it to a chat message.
   */
  private parseNewMessage(channelEventMessage: Ably.InboundMessage): Message | undefined {
    const { data, clientId, timestamp, extras } = channelEventMessage;

    if (!data) {
      this._logger.error(`received incoming message without data`, channelEventMessage);
      return;
    }

    if (!clientId) {
      this._logger.error(`received incoming message without clientId`, channelEventMessage);
      return;
    }

    if (!timestamp) {
      this._logger.error(`received incoming message without timestamp`, channelEventMessage);
      return;
    }

    const { content } = data;
    if (!content) {
      this._logger.error(`received incoming message without content`, channelEventMessage);
      return;
    }

    if (!extras) {
      this._logger.error(`received incoming message without extras`, channelEventMessage);
      return;
    }

    const { timeserial } = extras;
    if (!timeserial) {
      this._logger.error(`received incoming message without timeserial`, channelEventMessage);
      return;
    }

    return new DefaultMessage(timeserial, clientId, this._roomId, content, timestamp);
  }
}
