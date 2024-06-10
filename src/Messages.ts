import * as Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { MessageEvents } from './events.js';
import EventEmitter, { inspect, InvalidArgumentError, EventListener } from './utils/EventEmitter.js';
import { Message, DefaultMessage } from './Message.js';
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

enum MessagesInternalState {
  empty = 'empty',
  attaching = 'attaching',
  idle = 'idle',
  fetching = 'fetching',
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
   * Subscribe to a subset of message events in this chat room.
   *
   * @param eventOrEvents single event name or array of events to listen to
   * @param listener callback that will be called when these events are received
   */
  subscribe<K extends keyof MessageEventsMap>(eventOrEvents: K | K[], listener?: MessageListener): Promise<void>;

  /**
   * Subscribe to all message events in this chat room.
   * @param listener callback that will be called
   */
  subscribe(listener?: MessageListener): Promise<void>;

  /**
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  unsubscribe<K extends keyof MessageEventsMap>(eventOrEvents: K | K[], listener?: MessageListener): void;

  /**
   * Unsubscribe the given listener from all events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: MessageListener): void;

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

  private state: MessagesInternalState = MessagesInternalState.empty;
  private eventsQueue: Ably.InboundMessage[] = [];
  private unsubscribeFromChannel: (() => void) | null = null;

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
  subscribe<K extends keyof MessageEventsMap>(eventOrEvents: K | K[], listener?: MessageListener): Promise<void>;

  /**
   * @inheritdoc Messages
   */
  subscribe(listener?: MessageListener): Promise<void>;

  subscribe<K extends keyof MessageEventsMap>(
    listenerOrEvents?: K | K[] | MessageListener,
    listener?: MessageListener,
  ): Promise<void> {
    try {
      super.on(listenerOrEvents, listener);
      return this.attach();
    } catch (e: unknown) {
      if (e instanceof InvalidArgumentError) {
        throw new InvalidArgumentError(
          'Messages.subscribe(): Invalid arguments: ' + inspect([listenerOrEvents, listener]),
        );
      } else {
        throw e;
      }
    }
  }

  /**
   * @inheritdoc Messages
   */
  unsubscribe<K extends keyof MessageEventsMap>(eventOrEvents: K | K[], listener?: MessageListener): void;

  /**
   * Unsubscribe the given listener from all events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: EventListener<MessageEventsMap, keyof MessageEventsMap>): void;
  unsubscribe<K extends keyof MessageEventsMap>(
    listenerOrEvents?: K | K[] | MessageListener,
    listener?: MessageListener,
  ) {
    try {
      super.off(listenerOrEvents, listener);
      return this.detach();
    } catch (e: unknown) {
      if (e instanceof InvalidArgumentError) {
        throw new InvalidArgumentError(
          'Messages.unsubscribe(): Invalid arguments: ' + inspect([listenerOrEvents, listener]),
        );
      } else {
        throw e;
      }
    }
  }

  private attach() {
    if (this.state !== MessagesInternalState.empty) return Promise.resolve();
    this.state = MessagesInternalState.attaching;
    return this.doAttach((channelEventMessage: Ably.InboundMessage) => {
      if (this.state === MessagesInternalState.idle) {
        this.processEvent(channelEventMessage);
      } else {
        this.eventsQueue.push(channelEventMessage);
      }
    });
  }

  private async doAttach(channelHandler: Ably.messageCallback<Ably.InboundMessage>) {
    const unsubscribeFromChannel = () => this.channel.unsubscribe(channelHandler);
    this.unsubscribeFromChannel = unsubscribeFromChannel;
    await this.channel.subscribe(Object.values(MessageEvents), channelHandler);

    if (this.unsubscribeFromChannel !== unsubscribeFromChannel) return;

    this.state = MessagesInternalState.idle;
    this.processQueue();
  }

  private detach() {
    this.state = MessagesInternalState.empty;
    this.unsubscribeFromChannel?.();
    this.unsubscribeFromChannel = null;
  }

  private processQueue(): void {
    if (this.eventsQueue.length === 0 || this.state !== MessagesInternalState.idle) return;
    const event = this.eventsQueue[0];
    try {
      const processed = this.processEvent(event);
      if (processed) {
        this.eventsQueue.shift();
        return this.processQueue();
      }
    } catch (e) {
      console.warn(e);
    }
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
