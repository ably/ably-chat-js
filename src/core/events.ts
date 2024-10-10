/**
 * All chat message events.
 */
export enum MessageEvents {
  /** Fires when a new chat message is received. */
  Created = 'message.created',

  /** Fires when a chat message is updated. */
  Edited = 'message.edited',

  /** Fires when a chat message is deleted. */
  Deleted = 'message.deleted',
}

export enum RealtimeMessageNames {
  /** Represents a regular chat message. */
  ChatMessage = 'chat.message',

  /** The old legacy message type, used from v1 of the Publish endpoint.
   * @deprecated This will be removed in upcoming versions of the SDK,
   * once the realtime endpoint has been version bumped.
   */
  LegacyChatMessage = 'message.created',
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
