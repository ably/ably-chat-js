import { Types } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Message, Reaction } from './entities.js';
import RealtimeChannelPromise = Types.RealtimeChannelPromise;
import { MessageEvents, ReactionEvents } from './events.js';

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

interface ReactionListenerArgs {
  type: ReactionEvents;
  reaction: Reaction;
}

export type MessageListener = (args: MessageListenerArgs) => void;
export type ReactionListener = (args: ReactionListenerArgs) => void;
type ChannelListener = Types.messageCallback<Types.Message>;

export class Messages {
  private readonly conversationId: string;
  private readonly channel: RealtimeChannelPromise;
  private readonly chatApi: ChatApi;

  private channelListeners = new WeakMap<MessageListener | ReactionListener, ChannelListener>();

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
    return this.makeMessageApiCallAndWaitForRealtimeResult(MessageEvents.created, async () => {
      const { id } = await this.chatApi.sendMessage(this.conversationId, text);
      return id;
    });
  }

  async edit(messageId: string, text: string): Promise<Message> {
    return this.makeMessageApiCallAndWaitForRealtimeResult(MessageEvents.deleted, async () => {
      await this.chatApi.editMessage(this.conversationId, messageId, text);
      return messageId;
    });
  }

  async delete(message: Message): Promise<Message>;
  async delete(messageId: string): Promise<Message>;
  async delete(messageIdOrMessage: string | Message): Promise<Message> {
    const messageId = typeof messageIdOrMessage === 'string' ? messageIdOrMessage : messageIdOrMessage.id;

    return this.makeMessageApiCallAndWaitForRealtimeResult(MessageEvents.deleted, async () => {
      await this.chatApi.deleteMessage(this.conversationId, messageId);
      return messageId;
    });
  }

  async addReaction(messageId: string, reactionType: string) {
    return this.makeReactionApiCallAndWaitForRealtimeResult(ReactionEvents.added, async () => {
      const { id } = await this.chatApi.addMessageReaction(this.conversationId, messageId, reactionType);
      return id;
    });
  }

  async removeReaction(reactionId: string) {
    return this.makeReactionApiCallAndWaitForRealtimeResult(ReactionEvents.deleted, async () => {
      await this.chatApi.deleteMessageReaction(reactionId);
      return reactionId;
    });
  }

  async subscribe(event: MessageEvents, listener: MessageListener) {
    const channelListener = ({ name, data }: Types.Message) => {
      listener({
        type: name as MessageEvents,
        message: data,
      });
    };
    this.channelListeners.set(listener, channelListener);
    return this.channel.subscribe(event, channelListener);
  }

  unsubscribe(event: MessageEvents, listener: MessageListener) {
    const channelListener = this.channelListeners.get(listener);
    if (!channelListener) return;
    this.channel.unsubscribe(event, channelListener);
  }

  async subscribeReactions(event: ReactionEvents, listener: ReactionListener) {
    const channelListener = ({ name, data }: Types.Message) => {
      listener({
        type: name as ReactionEvents,
        reaction: data,
      });
    };
    this.channelListeners.set(listener, channelListener);
    return this.channel.subscribe(event, channelListener);
  }

  unsubscribeReactions(event: ReactionEvents, listener: ReactionListener) {
    const channelListener = this.channelListeners.get(listener);
    if (!channelListener) return;
    this.channel.unsubscribe(event, channelListener);
  }

  private async makeMessageApiCallAndWaitForRealtimeResult(event: MessageEvents, apiCall: () => Promise<string>) {
    const queuedMessages: Record<string, Message> = {};

    let waitingMessageId: string | null = null;
    let resolver: ((message: Message) => void) | null = null;

    const waiter = ({ data }: Types.Message) => {
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

  private async makeReactionApiCallAndWaitForRealtimeResult(event: ReactionEvents, apiCall: () => Promise<string>) {
    const queuedReaction: Record<string, Reaction> = {};

    let waitingReactionId: string | null = null;
    let resolver: ((reaction: Reaction) => void) | null = null;

    const waiter = ({ data }: Types.Message) => {
      const reaction: Reaction = data;
      if (waitingReactionId === null) {
        queuedReaction[reaction.id] = reaction;
      } else if (waitingReactionId === reaction.id) {
        resolver?.(reaction);
        resolver = null;
      }
    };

    await this.channel.subscribe(event, waiter);

    try {
      const reactionId = await apiCall();
      if (queuedReaction[reactionId]) {
        this.channel.unsubscribe(event, waiter);
        return queuedReaction[reactionId];
      }
      waitingReactionId = reactionId;
    } catch (e) {
      this.channel.unsubscribe(event, waiter);
      throw e;
    }

    return new Promise<Reaction>((resolve) => {
      resolver = (reaction) => {
        this.channel.unsubscribe(event, waiter);
        resolve(reaction);
      };
    });
  }
}
