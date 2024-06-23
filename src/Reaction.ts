/**
 * Represents a room-level reaction.
 */
export interface Reaction {
  /**
   * The type of the reaction, for example "like" or "love".
   */
  readonly type: string;

  /**
   * metadata of the reaction, if any was set
   */
  readonly metadata?: unknown;

  /**
   * The timestamp at which the reaction was sent.
   */
  readonly createdAt: Date;

  /**
   * The clientId of the user who sent the reaction.
   */
  readonly clientId: string;

  /**
   * Whether the reaction was sent by the current user.
   */
  readonly isSelf: boolean;
}

/**
 * An implementation of the Reaction interface for room-level reactions.
 */
export class DefaultReaction implements Reaction {
  constructor(
    public readonly type: string,
    public readonly clientId: string,
    public readonly createdAt: Date,
    public readonly isSelf: boolean,
    public readonly metadata: unknown,
  ) {
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }
}
