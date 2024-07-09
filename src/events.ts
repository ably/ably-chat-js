/**
 * All chat message events.
 */
export enum MessageEvents {
  /** Fires when a new chat message is received. */
  Created = 'message.created',
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
  /** Event trigger when a user starts typing. */
  TypingStarted = 'typing.typingStarted',
  /** Event trigger when a user stops typing. */
  TypingStopped = 'typing.typingStopped',
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
