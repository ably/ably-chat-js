import Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Message } from './entities.js';
import { MessageEvents } from './events.js';
import EventEmitter, { inspect, InvalidArgumentError, EventListener } from './utils/EventEmitter.js';
import { ChatMessage } from './ChatMessage.js';

interface MessageEventsMap {
  [MessageEvents.created]: MessageEventPayload;
}

export enum Direction {
  forwards = 'forwards',
  backwards = 'backwards',
}

interface QueryOptions {
  startId?: string;
  endId?: string;
  limit: number;
  direction?: keyof typeof Direction;
}

interface MessageEventPayload {
  type: MessageEvents;
  message: Message;
}

enum MessagesInternalState {
  empty = 'empty',
  attaching = 'attaching',
  idle = 'idle',
  fetching = 'fetching',
}

export type MessageListener = EventListener<MessageEventsMap, keyof MessageEventsMap>;

/**
 * This class is used to interact with messages in a chat room including subscribing
 * to them, fetching history, or sending messages.
 *
 * Get an instance via room.messages.
 */
export class Messages extends EventEmitter<MessageEventsMap> {
  private readonly roomId: string;
  private readonly channel: Ably.RealtimeChannel;
  private readonly chatApi: ChatApi;
  private readonly clientId: string;

  private state: MessagesInternalState = MessagesInternalState.empty;
  private eventsQueue: Ably.Message[] = [];
  private unsubscribeFromChannel: (() => void) | null = null;

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi, clientId: string) {
    super();
    this.roomId = roomId;
    this.channel = realtime.channels.get(this.realtimeChannelName);
    this.chatApi = chatApi;
    this.clientId = clientId;
  }

  /**
   * Get the full name of the Ably realtime channel used for the messages in this
   * chat room.
   */
  get realtimeChannelName(): string {
    return `${this.roomId}::$chat::$chatMessages`;
  }

  // eslint-disable-next-line
  async query(options: QueryOptions): Promise<Message[]> {
    return this.chatApi.getMessages(this.roomId, options);
  }

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
  async send(text: string): Promise<Message> {
    const response = await this.chatApi.sendMessage(this.roomId, text);

    return new ChatMessage(response.timeserial, this.clientId, this.roomId, text, response.createdAt);
  }

  /**
   * Subscribe to a subset of message events in this chat room.
   *
   * @param eventOrEvents single event name or array of events to listen to
   * @param listener callback that will be called when these events are received
   */
  subscribe<K extends keyof MessageEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<MessageEventsMap, K>,
  ): Promise<void>;

  /**
   * Subscribe to all message events in this chat room.
   * @param listener callback that will be called
   */
  subscribe(listener?: EventListener<MessageEventsMap, keyof MessageEventsMap>): Promise<void>;

  subscribe<K extends keyof MessageEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<MessageEventsMap, K>,
    listener?: EventListener<MessageEventsMap, K>,
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
   * Unsubscribe the given listener from the given list of events.
   * @param eventOrEvents single event name or array of events to unsubscribe from
   * @param listener listener to unsubscribe
   */
  unsubscribe<K extends keyof MessageEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<MessageEventsMap, K>,
  ): void;

  /**
   * Unsubscribe the given listener from all events.
   * @param listener listener to unsubscribe
   */
  unsubscribe(listener?: EventListener<MessageEventsMap, keyof MessageEventsMap>): void;
  unsubscribe<K extends keyof MessageEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<MessageEventsMap, K>,
    listener?: EventListener<MessageEventsMap, K>,
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
    return this.doAttach((channelEventMessage: Ably.Message) => {
      if (this.state === MessagesInternalState.idle) {
        this.processEvent(channelEventMessage);
      } else {
        this.eventsQueue.push(channelEventMessage);
      }
    });
  }

  private async doAttach(channelHandler: Ably.messageCallback<Ably.Message>) {
    const unsubscribeFromChannel = () => this.channel.unsubscribe(channelHandler);
    this.unsubscribeFromChannel = unsubscribeFromChannel;
    await this.channel.subscribe(channelHandler);

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

  private processEvent(channelEventMessage: Ably.Message) {
    const { name, data } = channelEventMessage;

    switch (name) {
      case MessageEvents.created: {
        const message = new ChatMessage(
          channelEventMessage.extras.timeserial,
          channelEventMessage.clientId!,
          this.roomId,
          data,
          channelEventMessage.timestamp!,
        );
        this.emit(MessageEvents.created, { type: name, message: message });
        return true;
      }
      default:
        throw new Ably.ErrorInfo(`Received illegal event="${name}"`, 40000, 400);
    }
  }
}
