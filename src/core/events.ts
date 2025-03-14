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

  /** Action applied to a new annotation. */
  MessageAnnotationCreate = 'annotation.create',

  /** Action applied to a deleted annotation. */
  MessageAnnotationDelete = 'annotation.delete',

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
   * Event triggered when a user is typing.
   */
  Start = 'typing.started',

  /**
   * Event triggered when a user stops typing.
   */
  Stop = 'typing.stopped',
}

/**
 * Represents a typing event payload.
 */
export interface TypingEvent {
  /**
   * The set of clientIds that are currently typing.
   */
  currentlyTyping: Set<string>;

  /**
   * Represents the change that resulted in the typing event.
   */
  change: {
    /**
     * The client ID of the user who stopped/started typing.
     */
    clientId: string;

    /**
     * Type of the event.
     */
    type: TypingEvents;
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
