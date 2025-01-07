import { ChatMessageActions, MessageEvents } from './events';
import { Message, MessageReactionSummary } from './message';

export interface EventPayload {
  /**
   * The type of the message event.
   */
  type: MessageEvents;

  /**
   * A shorthand to get the relevant message serial. For message events like
   * create, update and delete this is the message serial. For annotations
   * (eg. reactions) this is the `serial` of the relevant chat message, usually
   * found under `refSerial`.
   */
  get messageSerial(): string;
}

/**
 * Payload for a message event.
 */
export interface MessageEventPayload extends EventPayload {
  /**
   * The message that was received.
   */
  message: Message;
}

/**
 * Payload representing a single message reaction.
 */
export interface MessageReaction {
  /**
   * Serial of the message this reaction is for.
   */
  refSerial: string;

  /**
   * The reaction (ie. the emoji).
   */
  reaction: string;

  /**
   * The client ID of the user who added the reaction.
   */
  clientId: string;
}

/** Payload representing a message reaction summary event. */
export interface MessageReactionSummaries {
  /**
   * Timestamp of the summary.
   */
  timestamp: Date;

  /**
   * Serial of the message this summary references.
   */
  refSerial: string;

  /**
   * Summary Record for each reaction, keyed by the reaction.
   */
  reactions: Map<string, MessageReactionSummary>;
}

export interface MessageReactionPayload extends EventPayload {
  /**
   * The message that was received.
   */
  reaction: MessageReaction;
}

export interface MessageReactionSummaryPayload extends EventPayload {
  /**
   * The message that was received.
   */
  summary: MessageReactionSummaries;
}

/**
 * A listener for message events in a chat room.
 * @param event The message event that was received.
 */
export type MessageListener = (event: MessageEventPayload) => void;

export type ReactionsListener = (event: MessageReactionPayload) => void;

export type SummariesListener = (event: MessageReactionSummaryPayload) => void;

export interface MessageListenerObject {
  messages?: MessageListener;
  reactions?: ReactionsListener;
  summaries?: SummariesListener;
}

/**
 * Event names and their respective payloads emitted by the messages feature.
 */
export interface MessageEventsMap {
  [MessageEvents.Created]: MessageEventPayload;
  [MessageEvents.Updated]: MessageEventPayload;
  [MessageEvents.Deleted]: MessageEventPayload;
  [MessageEvents.ReactionCreated]: MessageReactionPayload;
  [MessageEvents.ReactionDeleted]: MessageReactionPayload;
  [MessageEvents.ReactionSummary]: MessageReactionSummaryPayload;
}

export type AnyMessageEvent = MessageEventsMap[keyof MessageEventsMap];

/**
 * Mapping of chat message actions to message events.
 */
export const MessageActionsToEventsMap: Map<ChatMessageActions, MessageEvents> = new Map<
  ChatMessageActions,
  MessageEvents
>([
  [ChatMessageActions.MessageCreate, MessageEvents.Created],
  [ChatMessageActions.MessageUpdate, MessageEvents.Updated],
  [ChatMessageActions.MessageDelete, MessageEvents.Deleted],
]);
