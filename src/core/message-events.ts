import { ChatMessageActions, MessageEvents } from './events';
import { Message, MessageReactionSummary } from './message';

/**
 * Payload for a message event.
 */
export interface MessageEvent {
  /**
   * The type of the message event.
   */
  type: MessageEvents.Created | MessageEvents.Updated | MessageEvents.Deleted;

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

export interface MessageReactionEvent{
  /**
   * The type of the message reaction event.
   */
  type: MessageEvents.ReactionCreated | MessageEvents.ReactionDeleted;

  /**
   * The message that was received.
   */
  reaction: MessageReaction;
}

export interface MessageReactionSummaryEvent {
  /**
   * The type of the message reaction summary event.
   */
  type: MessageEvents.ReactionSummary;
  
  /**
   * The message that was received.
   */
  summary: MessageReactionSummaries;
}

/**
 * A listener for message events in a chat room.
 * @param event The message event that was received.
 */
export type MessageListener = (event: MessageEvent) => void;

export type ReactionsListener = (event: MessageReactionEvent) => void;

export type ReactionSummaryListener = (event: MessageReactionSummaryEvent) => void;

/**
 * Event names and their respective payloads emitted by the messages feature.
 */
export interface MessageEventsMap {
  [MessageEvents.Created]: MessageEvent;
  [MessageEvents.Updated]: MessageEvent;
  [MessageEvents.Deleted]: MessageEvent;
}

/**
 * Mapping of chat message actions to message events.
 */
export const MessageActionsToEventsMap = new Map<
  ChatMessageActions,
  MessageEvents.Created | MessageEvents.Updated | MessageEvents.Deleted
>([
  [ChatMessageActions.MessageCreate, MessageEvents.Created],
  [ChatMessageActions.MessageUpdate, MessageEvents.Updated],
  [ChatMessageActions.MessageDelete, MessageEvents.Deleted],
]);
