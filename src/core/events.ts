import type { Message, MessageReactionSummary } from './message.js';
import type { OccupancyData } from './occupancy-parser.js';
import type { RoomReaction } from './room-reaction.js';
import type { TypingMember } from './typing.js';

/**
 * All chat message events.
 */
export enum ChatMessageEventType {
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
export enum RealtimeMessageName {
  /** Represents a regular chat message. */
  ChatMessage = 'chat.message',
}

/**
 * Realtime meta event types.
 */
export enum RealtimeMetaEventType {
  /** Represents a meta occupancy event. */
  Occupancy = '[meta]occupancy',
}

/**
 * Chat Message Actions.
 */
export enum ChatMessageAction {
  /** Action applied to a new message. */
  MessageCreate = 'message.create',

  /** Action applied to an updated message. */
  MessageUpdate = 'message.update',

  /** Action applied to a deleted message. */
  MessageDelete = 'message.delete',
}

/**
 * Enum representing presence events.
 */
export enum PresenceEventType {
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

/**
 * Enum representing the typing event types.
 */
export enum TypingEventType {
  /**
   * Event triggered when a user is typing.
   */
  Started = 'typing.started',

  /**
   * Event triggered when a user stops typing.
   */
  Stopped = 'typing.stopped',
}

/**
 * Enum representing the typing set event types.
 */
export enum TypingSetEventType {
  /**
   * Event triggered when a change occurs in the set of typers.
   */
  SetChanged = 'typing.set.changed',
}

/**
 * Represents a change in the state of current typers.
 */
export interface TypingSetEvent {
  /**
   * The type of the event.
   */
  type: TypingSetEventType;

  /**
   * The set of clientIds that are currently typing.
   * @deprecated Use {@link TypingSetEvent.currentTypers | currentTypers} instead, which includes metadata such as user claims.
   */
  currentlyTyping: Set<string>;

  /**
   * The set of users currently typing, with associated metadata.
   */
  currentTypers: TypingMember[];

  /**
   * Represents the change that resulted in the new set of typers.
   */
  change: {
    /**
     * The client ID of the user who stopped/started typing.
     */
    clientId: string;

    /**
     * Type of the change.
     */
    type: TypingEventType;

    /**
     * The user claim attached to this typing event by the server. This is set automatically
     * by the server when a JWT contains a matching `ably.room.<roomName>` claim.
     */
    userClaim?: string;
  };
}

/**
 * Room reaction events. This is used for the realtime system since room reactions
 * have only one event: "roomReaction".
 */
export enum RoomReactionRealtimeEventType {
  /**
   * Event triggered when a room reaction was received.
   */
  Reaction = 'roomReaction',
}

/**
 * The type of room reaction events.
 */
export enum RoomReactionEventType {
  /**
   * Event triggered when a room reaction was received.
   */
  Reaction = 'reaction',
}

/**
 * Event that is emitted when a room reaction is received.
 */
export interface RoomReactionEvent {
  /**
   * The type of the event.
   */
  readonly type: RoomReactionEventType;

  /**
   * The reaction that was received.
   */
  readonly reaction: RoomReaction;
}

/**
 * Payload for a message event.
 */
export interface ChatMessageEvent {
  /**
   * The type of the message event.
   */
  type: ChatMessageEventType;

  /**
   * The message that was received.
   */
  message: Message;
}

/**
 * All annotation types supported by Chat Message Reactions.
 */
export enum MessageReactionType {
  /**
   * Allows for at most one reaction per client per message. If a client reacts
   * to a message a second time, only the second reaction is counted in the
   * summary.
   *
   * This is similar to reactions on iMessage, Facebook Messenger or WhatsApp.
   */
  Unique = 'unique',

  /**
   * Allows for at most one reaction of each type per client per message. It is
   * possible for a client to add multiple reactions to the same message as
   * long as they are different (eg different emojis). Duplicates are not
   * counted in the summary.
   *
   * This is similar to reactions on Slack.
   */
  Distinct = 'distinct',

  /**
   * Allows any number of reactions, including repeats, and they are counted in
   * the summary. The reaction payload also includes a count of how many times
   * each reaction should be counted (defaults to 1 if not set).
   *
   * This is similar to the clap feature on Medium or how room reactions work.
   */
  Multiple = 'multiple',
}

/**
 * Enum representing the different annotation types used for message reactions.
 */
export enum ReactionAnnotationType {
  Unique = 'reaction:unique.v1',
  Distinct = 'reaction:distinct.v1',
  Multiple = 'reaction:multiple.v1',
}

/**
 * Maps Ably PubSub annotation types to Ably Chat message reaction types.
 *
 * The key type is string because we use it to lookup by PubSub event.type, which is a string.
 */
export const AnnotationTypeToReactionType: Record<string, MessageReactionType> = {
  [ReactionAnnotationType.Unique]: MessageReactionType.Unique,
  [ReactionAnnotationType.Distinct]: MessageReactionType.Distinct,
  [ReactionAnnotationType.Multiple]: MessageReactionType.Multiple,
} as const;

/**
 * Enum representing different raw message reaction events in the chat system.
 */
export enum MessageReactionRawEventType {
  /**
   * A reaction was added to a message.
   */
  Create = 'reaction.create',
  /**
   * A reaction was removed from a message.
   */
  Delete = 'reaction.delete',
}

/**
 * Enum representing different message reaction summary events in the chat system.
 */
export enum MessageReactionSummaryEventType {
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
  type: MessageReactionRawEventType;

  /** The timestamp of this event */
  timestamp: Date;

  /** The message reaction that was received. */
  reaction: {
    /** Serial of the message this reaction is for */
    messageSerial: string;

    /** Type of reaction */
    type: MessageReactionType;

    /** The reaction name (typically an emoji) */
    name: string;

    /** Count of the reaction (only for type Multiple, if set) */
    count?: number;

    /** The client ID of the user who added/removed the reaction */
    clientId: string;

    /**
     * The user claim attached to this reaction by the server. This is set automatically
     * by the Ably server when a JWT contains a matching `ably.room.<roomName>` claim.
     */
    userClaim?: string;
  };
}

/**
 * Event interface representing a summary of message reactions.
 * This event aggregates different types of reactions (single, distinct, counter) for a specific message.
 */
export interface MessageReactionSummaryEvent {
  /** The type of the event */
  type: MessageReactionSummaryEventType;

  /** Reference to the original message's serial */
  messageSerial: string;

  /** The message reactions summary. */
  reactions: MessageReactionSummary;
}

/**
 * Enum representing occupancy events.
 */
export enum OccupancyEventType {
  /**
   * Event triggered when occupancy is updated.
   */
  Updated = 'occupancy.updated',
}

/**
 * Represents an occupancy event.
 */
export interface OccupancyEvent {
  /**
   * The type of the occupancy event.
   */
  type: OccupancyEventType;

  /**
   * The occupancy data.
   */
  occupancy: OccupancyData;
}

/**
 * Room events.
 */
export enum RoomEventType {
  /**
   * Event triggered when a discontinuity is detected in the room's channel connection.
   * A discontinuity occurs when an attached or update event comes from the channel with resume=false,
   * except for the first attach or attaches after explicit detach calls.
   */
  Discontinuity = 'room.discontinuity',
}
