import { Types } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Message } from './entities.js';
import RealtimeChannelPromise = Types.RealtimeChannelPromise;
import { MessageEvents } from './events.js';

export const enum Direction {
  forwards = 'forwards',
  backwards = 'backwards',
}

interface QueryOptions {
  startId?: string;
  endId?: string;
  limit: number;
  direction?: keyof typeof Direction;
}

interface MessageListenerArgs {
  type: MessageEvents;
  message: Message;
}

export type MessageListener = (args: MessageListenerArgs) => void;
type ChannelListener = Types.messageCallback<Types.Message>;

export class Messages {
  private readonly conversationId: string;
  private readonly channel: RealtimeChannelPromise;
  private readonly chatApi: ChatApi;

  private messageToChannelListener = new WeakMap<MessageListener, ChannelListener>();

  constructor(conversationId: string, channel: RealtimeChannelPromise, chatApi: ChatApi) {
    this.conversationId = conversationId;
    this.channel = channel;
    this.chatApi = chatApi;
  }

  // eslint-disable-next-line
  async query(options: QueryOptions): Promise<Message[]> {
    return this.chatApi.getMessages(this.conversationId, options);
  }

  async send(text: string): Promise<Message> {
    const createdMessages: Record<string, Message> = {};

    let waitingMessageId: string | null = null;
    let resolver: ((message: Message) => void) | null = null;

    const waiter = ({ data }: Types.Message) => {
      const message: Message = data;
      if (waitingMessageId == null) createdMessages[message.id] = message;
      if (waitingMessageId == message.id) resolver?.(message);
    };

    await this.channel.subscribe(MessageEvents.created, waiter);

    try {
      const { id } = await this.chatApi.sendMessage(this.conversationId, text);
      if (createdMessages[id]) {
        this.channel.unsubscribe(MessageEvents.created, waiter);
        return createdMessages[id];
      }
      waitingMessageId = id;
    } catch (e) {
      this.channel.unsubscribe(MessageEvents.created, waiter);
      throw e;
    }

    return new Promise((resolve) => {
      resolver = (message) => {
        this.channel.unsubscribe(MessageEvents.created, waiter);
        resolve(message);
      };
    });
  }

  async edit(messageId: string, text: string): Promise<Message> {
    let resolver: ((message: Message) => void) | null = null;
    const waiter = ({ data }: Types.Message) => {
      const message: Message = data;
      if (messageId == message.id) resolver?.(message);
    };

    const promise: Promise<Message> = new Promise((resolve) => {
      resolver = (message) => {
        this.channel.unsubscribe(MessageEvents.updated, waiter);
        resolve(message);
      };
    });

    await this.channel.subscribe(MessageEvents.updated, waiter);

    try {
      await this.chatApi.editMessage(this.conversationId, messageId, text);
    } catch (e) {
      this.channel.unsubscribe(MessageEvents.updated, waiter);
      throw e;
    }

    return promise;
  }

  async subscribe(event: MessageEvents, listener: MessageListener) {
    const channelListener = ({ name, data }: Types.Message) => {
      listener({
        type: name as MessageEvents,
        message: data,
      });
    };
    this.messageToChannelListener.set(listener, channelListener);
    return this.channel.subscribe(event, channelListener);
  }

  unsubscribe(event: MessageEvents, listener: MessageListener) {
    const channelListener = this.messageToChannelListener.get(listener);
    if (!channelListener) return;
    this.channel.unsubscribe(event, channelListener);
  }
}
