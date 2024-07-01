import { Headers } from './Headers.js';
import { Metadata } from './Metadata.js';
import { DefaultTimeserial, Timeserial } from './Timeserial.js';

/**
 * {@link Headers} type for chat messages.
 */
export type MessageHeaders = Headers;

/**
 * {@link Metadata} type for chat messages.
 */
export type MessageMetadata = Metadata;

/**
 * Represents a single message in a chat room.
 */
export interface Message {
  /**
   * The unique identifier of the message.
   */
  readonly timeserial: string;

  /**
   * The clientId of the user who created the message.
   */
  readonly clientId: string;

  /**
   * The roomId of the chat room to which the message belongs.
   */
  readonly roomId: string;

  /**
   * The text of the message.
   */
  readonly text: string;

  /**
   * The timestamp at which the message was created.
   */
  readonly createdAt: Date;

  /**
   * The metadata of a chat message. Allows for attaching extra info to a message,
   * which can be used for various features such as animations, effects, or simply
   * to link it to other resources such as images, relative points in time, etc.
   *
   * Metadata is part of the Ably Pub/sub message content and is not read by Ably.
   *
   * This value is always set. If there is no metadata, this is an empty object.
   *
   * Do not use metadata for authoritative information. There is no server-side
   * validation. When reading the metadata treat it like user input.
   */
  readonly metadata: MessageMetadata;

  /**
   * The headers of a chat message. Headers enable attaching extra info to a message,
   * which can be used for various features such as linking to a relative point in
   * time of a livestream video or flagging this message as important or pinned.
   *
   * Headers are part of the Ably realtime message extras.headers and they can be used
   * for Filtered Subscriptions and similar.
   *
   * This value is always set. If there are no headers, this is an empty object.
   *
   * Do not use the headers for authoritative information. There is no server-side
   * validation. When reading the headers treat them like user input.
   */
  readonly headers: MessageHeaders;

  /**
   * Determines if this message was created before the given message.
   * @param message The message to compare against.
   * @returns true if this message was created before the given message, in global order.
   * @throws {@link ErrorInfo} if timeserial of either message is invalid.
   */
  before(message: Message): boolean;

  /**
   * Determines if this message was created after the given message.
   * @param message The message to compare against.
   * @returns true if this message was created after the given message, in global order.
   * @throws {@link ErrorInfo} if timeserial of either message is invalid.
   */
  after(message: Message): boolean;

  /**
   * Determines if this message is equal to the given message.
   * @param message The message to compare against.
   * @returns true if this message is equal to the given message.
   * @throws {@link ErrorInfo} if timeserial of either message is invalid.
   */
  equal(message: Message): boolean;
}

/**
 * An implementation of the Message interface for chat messages.
 *
 * Allows for comparison of messages based on their timeserials.
 */
export class DefaultMessage implements Message {
  private readonly _calculatedTimeserial: Timeserial;

  constructor(
    public readonly timeserial: string,
    public readonly clientId: string,
    public readonly roomId: string,
    public readonly text: string,
    public readonly createdAt: Date,
    public readonly metadata: MessageMetadata,
    public readonly headers: MessageHeaders,
  ) {
    this._calculatedTimeserial = DefaultTimeserial.calculateTimeserial(timeserial);

    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }

  before(message: Message): boolean {
    return this._calculatedTimeserial.before(message.timeserial);
  }

  after(message: Message): boolean {
    return this._calculatedTimeserial.after(message.timeserial);
  }

  equal(message: Message): boolean {
    return this._calculatedTimeserial.equal(message.timeserial);
  }
}
