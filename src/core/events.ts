import { Message } from './message.js';

/**
 * All chat message events.
 */
export enum MessageEvents {
  /** Fires when a new chat message is received. */
  Created = 'message.created',

  /** Fires when a chat message is updated. */
  Updated = 'message.updated',

  /** Fires when a chat message is deleted. */
  Deleted = 'message.deleted',
}

/**
 * Realtime chat message names.
 */
export enum RealtimeMessageNames {
  /** Represents a regular chat message. */
  ChatMessage = 'chat.message',
}

/**
 * Chat Message Actions.
 */
export enum ChatMessageActions {
  /** Action applied to a new message. */
  MessageCreate = 'message.create',

  /** Action applied to an updated message. */
  MessageUpdate = 'message.update',

  /** Action applied to a deleted message. */
  MessageDelete = 'message.delete',

  /** Action applied to an annotation summary message. */
  MessageAnnotationSummary = 'message.summary',

  /** Action applied to a meta occupancy message. */
  MessageMetaOccupancy = 'meta.occupancy',
}

/**
 * Enum representing presence events.
 */
export enum PresenceEvents {
  /**
   * Event triggered when a user enters.
   */
  Enter = 'enter',

  /**
   * Event triggered when a user leaves.
   */
  Leave = 'leave',

  /**
   * Event triggered when a user updates their presence data.
   */
  Update = 'update',
  /**
   * Event triggered when a user initially subscribes to presence.
   */
  Present = 'present',
}

export enum TypingEvents {
  /** The set of currently typing users has changed. */
  Changed = 'typing.changed',
}

/**
 * Room reaction events. This is used for the realtime system since room reactions
 * have only one event: "roomReaction".
 */
export enum RoomReactionEvents {
  /**
   * Event triggered when a room reaction was received.
   */
  Reaction = 'roomReaction',
}

/**
 * Payload for a message event.
 */
export interface MessageEvent {
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
 * All annotation refTypes supported by Chat Message Reactions.
 */
export enum ReactionRefType {
  /**
   * Allows for at most one reaction per client per message. If a client reacts
   * to a message a second time, only the second reaction is counted in the
   * summary.
   *
   * This is similar to reactions on iMessage, Facebook Messenger or WhatsApp.
   */
  Unique = 'reaction:unique.v1',

  /**
   * Allows for at most one reaction of each type per client per message. It is
   * possible for a client to add multiple reactions to the same message as
   * long as they are different (eg different emojis). Duplicates are not
   * counted in the summary.
   *
   * This is similar to reactions on Slack.
   */
  Distinct = 'reaction:distinct.v1',

  /**
   * Allows any number of reactions, including repeats, and they are counted in
   * the summary. The reaction payload also includes a count of how many times
   * each reaction should be counted (defaults to 1 if not set).
   *
   * This is similar to the clap feature on Medium or how room reactions work.
   */
  Multiple = 'reaction:multiple.v1',
}

/**
 * Represents the summary of reactions of type @link{ReactionRefType.Unique}.
 */
export interface UniqueReactionSummary {
  /**
   * Total number of reactions.
   */
  total: number;

  /**
   * List of client IDs that reacted to the message.
   */
  clientIds: string[];
}

/**
 * Represents the summary of reactions of type @link{ReactionRefType.Distinct}.
 */
export interface DistinctReactionSummary {
  /**
   * Total number of reactions.
   */
  total: number;

  /**
   * List of client IDs that reacted to the message.
   */
  clientIds: string[];
}

/**
 * Represents the summary of reactions of type @link{ReactionRefType.Multiple}.
 */
export interface MultipleReactionSummary {
  /**
   * Total number of reactions, where each reaction can count more than once,
   * controlled by its `count` property.
   */
  total: number;

  /**
   * List of client IDs that reacted to the message, with the total count for
   * each client.
   */
  clientIds: Record<string, number>;
}

/**
 * Enum representing different message reaction events in the chat system.
 * @enum {string}
 */
export enum MessageReactionEvents {
  /**
   * A reaction was added to a message.
   */
  Create = 'reaction.create',
  /**
   * A reaction was removed from a message.
   */
  Delete = 'reaction.delete',
  /**
   * A reactions summary was updated for a message.
   */
  Summary = 'reaction.summary',
}

/**
 * Represents an individual message reaction event.
 */
export interface MessageReactionRawEvent {
  /** Whether reaction was added or removed */
  type: MessageReactionEvents.Create | MessageReactionEvents.Delete;

  /** Serial of the message this reaction is for */
  refSerial: string;

  /** Type of reaction */
  refType: ReactionRefType;

  /** The reaction (typically an emoji) */
  reaction: string;

  /** Count of the reaction (only for Counter refType, if set) */
  count?: number;

  /** The client ID of the user who added/removed the reaction */
  clientId: string;

  /** The timestamp of this event */
  timestamp: Date;
}

/**
 * Event interface representing a summary of message reactions.
 * This event aggregates different types of reactions (single, distinct, counter) for a specific message.
 */
export interface MessageReactionSummaryEvent {
  /** The type of the event */
  type: MessageReactionEvents.Summary;

  /** When the summary was generated */
  timestamp: Date;

  /** Reference to the original message's serial number */
  refSerial: string;

  /** Version of the summary event */
  version: string;

  /** Map of unique-type reactions summaries */
  unique: Record<string, UniqueReactionSummary>;

  /** Map of distinct-type reactions summaries */
  distinct: Record<string, DistinctReactionSummary>;

  /** Map of multiple-type reactions summaries */
  multiple: Record<string, MultipleReactionSummary>;
}
