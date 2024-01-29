import { ReactionEvents } from './events.js';
import { Reaction } from './entities.js';
import EventEmitter, { inspect, InvalidArgumentError, EventListener } from './utils/EventEmitter.js';
import { ChatApi } from './ChatApi.js';
import { Types } from 'ably/promises.js';
import RealtimeChannelPromise = Types.RealtimeChannelPromise;

export type ReactionListener = EventListener<ReactionEventsMap, keyof ReactionEventsMap>;
interface ReactionEventPayload {
  type: ReactionEvents;
  reaction: Reaction;
}

export interface ReactionEventsMap {
  [ReactionEvents.created]: ReactionEventPayload;
  [ReactionEvents.deleted]: ReactionEventPayload;
}

export class MessageReactions extends EventEmitter<ReactionEventsMap> {
  private readonly conversationId: string;
  private readonly channel: RealtimeChannelPromise;
  private readonly chatApi: ChatApi;

  constructor(conversationId: string, channel: RealtimeChannelPromise, chatApi: ChatApi) {
    super();
    this.conversationId = conversationId;
    this.channel = channel;
    this.chatApi = chatApi;
  }

  async add(messageId: string, reactionType: string) {
    return this.makeApiCallAndWaitForRealtimeResult(ReactionEvents.created, async () => {
      const { id } = await this.chatApi.addMessageReaction(this.conversationId, messageId, reactionType);
      return id;
    });
  }

  async remove(reactionId: string) {
    return this.makeApiCallAndWaitForRealtimeResult(ReactionEvents.deleted, async () => {
      await this.chatApi.deleteMessageReaction(reactionId);
      return reactionId;
    });
  }

  subscribe<K extends keyof ReactionEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<ReactionEventsMap, K>,
  ): void;
  subscribe(listener?: EventListener<ReactionEventsMap, keyof ReactionEventsMap>): void;
  subscribe<K extends keyof ReactionEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<ReactionEventsMap, K>,
    listener?: EventListener<ReactionEventsMap, K>,
  ) {
    try {
      super.on(listenerOrEvents, listener);
    } catch (e: unknown) {
      if (e instanceof InvalidArgumentError) {
        throw new InvalidArgumentError(
          'MessageReactions.subscribe(): Invalid arguments: ' + inspect([listenerOrEvents, listener]),
        );
      } else {
        throw e;
      }
    }
  }

  unsubscribe<K extends keyof ReactionEventsMap>(
    eventOrEvents: K | K[],
    listener?: EventListener<ReactionEventsMap, K>,
  ): void;
  unsubscribe(listener?: EventListener<ReactionEventsMap, keyof ReactionEventsMap>): void;
  unsubscribe<K extends keyof ReactionEventsMap>(
    listenerOrEvents?: K | K[] | EventListener<ReactionEventsMap, K>,
    listener?: EventListener<ReactionEventsMap, K>,
  ) {
    try {
      super.off(listenerOrEvents, listener);
    } catch (e: unknown) {
      if (e instanceof InvalidArgumentError) {
        throw new InvalidArgumentError(
          'MessageReactions.unsubscribe(): Invalid arguments: ' + inspect([listenerOrEvents, listener]),
        );
      } else {
        throw e;
      }
    }
  }
  private async makeApiCallAndWaitForRealtimeResult(event: ReactionEvents, apiCall: () => Promise<string>) {
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