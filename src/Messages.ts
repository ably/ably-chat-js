import Ably from 'ably'
import { ChatApi } from './ChatApi.js';
import { Message, Reaction } from './entities.js';
import { MessageEvents, ReactionEvents } from './events.js';
import EventEmitter, { inspect, InvalidArgumentError, EventListener } from './utils/EventEmitter.js';
import { type MessageCache, initMessageCache, CACHE_SIZE } from './utils/messageCache.js';
import { MessageReactions, ReactionEventsMap } from './MessageReactions.js';
import { addToArrayWithLimit } from './utils/array.js';

interface MessageEventsMap {
  [MessageEvents.created]: MessageEventPayload;
  [MessageEvents.edited]: MessageEventPayload;
  [MessageEvents.deleted]: MessageEventPayload;
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

const MAX_STORED_REACTIONS = 10;

export class Messages extends EventEmitter<MessageEventsMap> {
  private readonly roomId: string;
  private readonly channel: Ably.RealtimeChannel;
  private readonly chatApi: ChatApi;
  private readonly reactions: MessageReactions;
  private readonly clientId: String;

  private readonly cache: MessageCache;
  private state: MessagesInternalState = MessagesInternalState.empty;
  private eventsQueue: Ably.Message[] = [];
  private unsubscribeFromChannel: (() => void) | null = null;

  constructor(roomId: string, channel: Ably.RealtimeChannel, chatApi: ChatApi, clientId: String) {
    super();
    this.roomId = roomId;
    this.channel = channel;
    this.chatApi = chatApi;
    this.clientId = clientId;
    this.reactions = new MessageReactions(roomId, channel, chatApi);
    this.cache = initMessageCache();
  }

  // eslint-disable-next-line
  async query(options: QueryOptions): Promise<Message[]> {
    return this.chatApi.getMessages(this.roomId, options);
  }

  async send(text: string): Promise<Message> {
    return this.makeMessageApiCallAndWaitForRealtimeResult(MessageEvents.created, async () => {
      const { id } = await this.chatApi.sendMessage(this.roomId, text);
      return id;
    });
  }

  async edit(messageId: string, text: string): Promise<Message> {
    return this.makeMessageApiCallAndWaitForRealtimeResult(MessageEvents.deleted, async () => {
      await this.chatApi.editMessage(this.roomId, messageId, text);
      return messageId;
    });
  }

  async delete(message: Message): Promise<Message>;
  async delete(messageId: string): Promise<Message>;
  async delete(messageIdOrMessage: string | Message): Promise<Message> {
    const messageId = typeof messageIdOrMessage === 'string' ? messageIdOrMessage : messageIdOrMessage.id;

    return this.makeMessageApiCallAndWaitForRealtimeResult(MessageEvents.deleted, async () => {
      await this.chatApi.deleteMessage(this.roomId, messageId);
      return messageId;
    });
  }

  async addReaction(messageId: string, reactionType: string) {
    return this.reactions.add(messageId, reactionType);
  }

  async removeReaction(messageId: string, reactionId: string) {
    return this.reactions.remove(messageId, reactionId);
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

  subscribeReactions(
    eventOrEvents: ReactionEvents | ReactionEvents[],
    listener?: EventListener<ReactionEventsMap, ReactionEvents>,
  ) {
    this.reactions.subscribe(eventOrEvents, listener);
    return this.attach();
  }

  unsubscribeReactions(
    eventOrEvents: ReactionEvents | ReactionEvents[],
    listener?: EventListener<ReactionEventsMap, ReactionEvents>,
  ) {
    this.reactions.unsubscribe(eventOrEvents, listener);
    return this.detach();
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

    const messages = await this.query({ limit: CACHE_SIZE / 2 });

    if (this.unsubscribeFromChannel !== unsubscribeFromChannel) return;

    messages.forEach((msg) => this.cache.set(msg.id, msg));
    this.state = MessagesInternalState.idle;
    this.processQueue();
  }

  private detach() {
    if (this.hasListeners() || this.reactions.hasListeners()) return;
    this.state = MessagesInternalState.empty;
    this.cache.clear();
    this.unsubscribeFromChannel?.();
    this.unsubscribeFromChannel = null;
  }

  private async fetchSingleMessage(messageId: string) {
    const message = await this.chatApi.getMessage(this.roomId, messageId);
    this.cache.set(messageId, message);
    this.state = MessagesInternalState.idle;
    return this.processQueue();
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
        this.cache.set(data.id, data);
        this.emit(MessageEvents.created, { type: name, message: data });
        return true;
      case MessageEvents.edited:
        return this.processIfInCache(data.id, channelEventMessage, (message) => {
          const updated = { ...message, ...data };
          this.cache.set(updated.id, updated);
          this.emit(MessageEvents.edited, { type: name, message: updated });
        });
      case MessageEvents.deleted:
        return this.processIfInCache(data.id, channelEventMessage, (message) => {
          this.emit(MessageEvents.deleted, { type: name, message });
        });
      case ReactionEvents.created:
        return this.processIfInCache(data.message_id, channelEventMessage, (message) => {
          this.reactions.emit(ReactionEvents.created, { type: name, reaction: data });
          const updated = this.addReactionToMessage(message, data);
          this.cache.set(updated.id, updated);
          this.emit(MessageEvents.edited, {
            type: MessageEvents.edited,
            message: updated,
          });
        });
      case ReactionEvents.deleted:
        return this.processIfInCache(data.message_id, channelEventMessage, (msg) => {
          this.reactions.emit(ReactionEvents.deleted, { type: name, reaction: data });
          const updated = this.deleteReactionFromMessage(msg, data);
          this.cache.set(updated.id, updated);
          this.emit(MessageEvents.edited, {
            type: MessageEvents.edited,
            message: updated,
          });
        });
      default:
        throw new Ably.ErrorInfo(`Received illegal event="${name}"`, 400, 4000);
    }
  }

  private processIfInCache(
    messageId: string,
    channelEventMessage: Ably.Message,
    processor: (msg: Message) => void,
  ): boolean {
    if (!this.cache.has(messageId)) {
      this.state = MessagesInternalState.fetching;
      this.fetchSingleMessage(messageId);
      this.eventsQueue.push(channelEventMessage);
      return false;
    } else {
      processor(this.cache.get(messageId)!!);
      return true;
    }
  }

  private addReactionToMessage(message: Message, reaction: Reaction): Message {
    return {
      ...message,
      reactions: {
        mine:
          reaction.created_by === this.clientId
            ? addToArrayWithLimit(message.reactions?.mine ?? [], reaction, MAX_STORED_REACTIONS)
            : message.reactions?.mine ?? [],
        latest: addToArrayWithLimit(message.reactions?.latest ?? [], reaction, MAX_STORED_REACTIONS),
        counts: {
          ...message.reactions?.counts,
          [reaction.type]: (message.reactions?.counts?.[reaction.type] ?? 0) + 1,
        },
      },
    };
  }

  private deleteReactionFromMessage(message: Message, reaction: Reaction): Message {
    return {
      ...message,
      reactions: {
        mine:
          (reaction.created_by === this.clientId
            ? message.reactions?.mine.filter(({ id }) => id !== reaction.id)
            : message.reactions?.mine) ?? [],
        latest: message.reactions?.latest.filter(({ id }) => id !== reaction.id) ?? [],
        counts: {
          ...message.reactions?.counts,
          [reaction.type]: (message.reactions?.counts?.[reaction.type] ?? 0) - 1,
        },
      },
    };
  }

  private async makeMessageApiCallAndWaitForRealtimeResult(event: MessageEvents, apiCall: () => Promise<string>) {
    const queuedMessages: Record<string, Message> = {};

    let waitingMessageId: string | null = null;
    let resolver: ((message: Message) => void) | null = null;

    const waiter = ({ data }: Ably.Message) => {
      const message: Message = data;
      if (waitingMessageId === null) {
        queuedMessages[message.id] = message;
      } else if (waitingMessageId === message.id) {
        resolver?.(message);
        resolver = null;
      }
    };

    await this.channel.subscribe(event, waiter);

    try {
      const messageId = await apiCall();
      if (queuedMessages[messageId]) {
        this.channel.unsubscribe(event, waiter);
        return queuedMessages[messageId];
      }
      waitingMessageId = messageId;
    } catch (e) {
      this.channel.unsubscribe(event, waiter);
      throw e;
    }

    return new Promise<Message>((resolve) => {
      resolver = (message) => {
        this.channel.unsubscribe(event, waiter);
        resolve(message);
      };
    });
  }
}
