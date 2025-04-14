import * as Ably from 'ably';

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

/**
 * All typing events.
 */
export enum TypingEvents {
  /**
   * Event triggered when a change occurs in the set of typers.
   */
  SetChanged = 'typing.set.changed',

  /**
   * Event triggered when a user is typing.
   */
  Start = 'typing.started',

  /**
   * Event triggered when a user stops typing.
   */
  Stop = 'typing.stopped',
}

/**
 * Represents a change in the state of current typers.
 */
export interface TypingEvent {
  /**
   * The type of the event.
   */
  type: TypingEvents;

  /**
   * The set of clientIds that are currently typing.
   */
  currentlyTyping: Set<string>;

  /**
   * Represents the change that resulted in the new set of typers.
   */
  change: {
    /**
     * The client ID of the user who stopped/started typing.
     */
    clientId: string;

    /**
     * Type of the change. Either `typing.started` or `typing.stopped`.
     */
    type: TypingEvents.Start | TypingEvents.Stop;
  };
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

  /** The timestamp of this event */
  timestamp: Date;

  /** The message reaction that was received. */
  reaction: {
    /** Serial of the message this reaction is for */
    messageSerial: string;

    /** Type of reaction */
    type: MessageReactionType;

    /** The reaction (typically an emoji) */
    reaction: string;

    /** Count of the reaction (only for type Multiple, if set) */
    count?: number;

    /** The client ID of the user who added/removed the reaction */
    clientId: string;
  };
}

/**
 * Event interface representing a summary of message reactions.
 * This event aggregates different types of reactions (single, distinct, counter) for a specific message.
 */
export interface MessageReactionSummaryEvent {
  /** The type of the event */
  type: MessageReactionEvents.Summary;

  /** The message reactions summary. */
  summary: {
    /** When the summary was generated */
    timestamp: Date;

    /** Reference to the original message's serial number */
    messageSerial: string;

    /** Map of unique-type reactions summaries */
    unique: Ably.SummaryUniqueValues;

    /** Map of distinct-type reactions summaries */
    distinct: Ably.SummaryDistinctValues;

    /** Map of multiple-type reactions summaries */
    multiple: Ably.SummaryMultipleValues;
  };
}

/**
 * Room events.
 */
export enum RoomEvents {
  /**
   * Event triggered when a discontinuity is detected in the room's channel connection.
   * A discontinuity occurs when an attached or update event comes from the channel with resume=false,
   * except for the first attach or attaches after explicit detach calls.
   */
  Discontinuity = 'room.discontinuity',
}
