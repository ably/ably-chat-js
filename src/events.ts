/**
 * All chat message events.
 */
export enum MessageEvents {
  /** Fires when a new chat message is received. */
  created = 'message.created',
}

/**
 * Enum representing presence events.
 */
export enum PresenceEvents {
  /**
   * Event triggered when a user enters.
   */
  enter = 'enter',

  /**
   * Event triggered when a user leaves.
   */
  leave = 'leave',

  /**
   * Event triggered when a user updates their presence data.
   */
  update = 'update',
  /**
   * Event triggered when a user initially subscribes to presence.
   */
  present = 'present',

  /**
   * Event triggered while syncing if leave event received before end of sync.
   */
  absent = 'absent',
}

export enum TypingEvents {
  /** Event trigger when a user starts typing. */
  typingStarted = 'typing.typingStarted',
  /** Event trigger when a user stops typing. */
  typingStopped = 'typing.typingStopped',
}

/**
 * Room reaction events. This is used for the realtime system since room reactions
 * have only one event: "roomReaction".
 */
export enum RoomReactionEvents {
  /**
   * Event triggered when a room reaction was received.
   */
  reaction = 'roomReaction',
}
