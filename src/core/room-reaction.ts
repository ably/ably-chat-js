import { Headers } from './headers.js';
import { Metadata } from './metadata.js';

/**
 * {@link Headers} type for chat messages.
 */
export type RoomReactionHeaders = Headers;

/**
 * {@link Metadata} type for chat messages.
 */
export type RoomReactionMetadata = Metadata;

/**
 * Represents a room-level reaction.
 */
export interface RoomReaction {
  /**
   * The name of the reaction, for example "like" or "love".
   */
  readonly name: string;

  /**
   * Metadata of the reaction. If no metadata was set this is an empty object.
   */
  readonly metadata: RoomReactionMetadata;

  /**
   * Headers of the reaction. If no headers were set this is an empty object.
   */
  readonly headers: RoomReactionHeaders;

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

  /**
   * The user claim attached to this reaction by the server. This is set automatically
   * by the Ably server when a JWT contains a matching `ably.room.<roomName>` claim.
   */
  readonly userClaim?: string;
}

/**
 * An implementation of the RoomReaction interface for room-level reactions.
 */
export class DefaultRoomReaction implements RoomReaction {
  constructor(
    public readonly name: string,
    public readonly clientId: string,
    public readonly createdAt: Date,
    public readonly isSelf: boolean,
    public readonly metadata: RoomReactionMetadata,
    public readonly headers: RoomReactionHeaders,
    public readonly userClaim?: string,
  ) {
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }
}
