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
  /** Represents a message with no action set. */
  MessageUnset = 'message.unset',

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
  ReactionPolled = 'roomReactionPolled',
}
