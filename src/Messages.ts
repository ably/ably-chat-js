import Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Message } from './entities.js';
import { MessageEvents } from './events.js';
import EventEmitter, { inspect, InvalidArgumentError, EventListener } from './utils/EventEmitter.js';

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

  get realtimeChannelName(): string {
    return `${this.roomId}::$chat::$chatMessages`;
  }

  // eslint-disable-next-line
  async query(options: QueryOptions): Promise<Message[]> {
    return this.chatApi.getMessages(this.roomId, options);
  }

  async send(text: string): Promise<Message> {
    const response = await this.chatApi.sendMessage(this.roomId, text);

    // note: this implementation will change when posting a message starts returning the full message
    return {
      id: response.timeserial,
      content: text,
      created_by: this.clientId,
      created_at: response.createdAt, // note: this is not a real created_at timestamp, that can right now be parsed from the ULID
      room_id: this.roomId,
    };
  }

  subscribe<K extends keyof MessageEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<MessageEventsMap, K>,
  ): void;
  subscribe(listener?: EventListener<MessageEventsMap, keyof MessageEventsMap>): void;
  subscribe<K extends keyof MessageEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<MessageEventsMap, K>,
    listener?: EventListener<MessageEventsMap, K>,
  ) {
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

  unsubscribe<K extends keyof MessageEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<MessageEventsMap, K>,
  ): void;
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

  private async processQueue(): Promise<void> {
    if (this.eventsQueue.length === 0 || this.state !== MessagesInternalState.idle) return;
    const event = this.eventsQueue[0];
    try {
      const processed = await this.processEvent(event);
      if (processed) {
        this.eventsQueue.shift();
        return this.processQueue();
      }
    } catch (e) {
      console.warn(e);
    }
  }

  private async processEvent(channelEventMessage: Ably.Message) {
    const { name, data } = channelEventMessage;
    switch (name) {
      case MessageEvents.created:
        this.emit(MessageEvents.created, { type: name, message: data });
        return true;
      default:
        throw new Ably.ErrorInfo(`Received illegal event="${name}"`, 400, 4000);
    }
  }
}
