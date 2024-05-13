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
}
