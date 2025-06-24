import { Headers } from './headers.js';
import { Metadata } from './metadata.js';

/**
 * {@link Headers} type for chat messages.
 */
export type ReactionHeaders = Headers;

/**
 * {@link Metadata} type for chat messages.
 */
export type ReactionMetadata = Metadata;

/**
 * Represents a room-level reaction.
 */
export interface Reaction {
  /**
   * The name of the reaction, for example "like" or "love".
   */
  readonly name: string;

  /**
   * Metadata of the reaction. If no metadata was set this is an empty object.
   */
  readonly metadata: ReactionMetadata;

  /**
   * Headers of the reaction. If no headers were set this is an empty object.
   */
  readonly headers: ReactionHeaders;

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
    public readonly name: string,
    public readonly clientId: string,
    public readonly createdAt: Date,
    public readonly isSelf: boolean,
    public readonly metadata: ReactionMetadata,
    public readonly headers: ReactionHeaders,
  ) {
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }
}
