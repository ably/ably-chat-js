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

export enum TypingIndicatorEvents {
  /** Event trigger when a user starts typing. */
  typingStarted = 'typingIndicator.typingStarted',
  /** Event trigger when a user stops typing. */
  typingStopped = 'typingIndicator.typingStopped',
}
