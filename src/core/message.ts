import { Headers } from './headers.js';
import { DetailsMetadata, Metadata } from './metadata.js';
import { DefaultSerial, Serial } from './serial.js';

/**
 * {@link Headers} type for chat messages.
 */
export type MessageHeaders = Headers;

/**
 * {@link Metadata} type for chat messages.
 */
export type MessageMetadata = Metadata;

/**
 * {@link DetailsMetadata} type for a chat messages {@link MessageDetails}.
 */
export type MessageDetailsMetadata = DetailsMetadata;

/**
 * Represents the detail of a message deletion or update.
 */
export interface MessageDetails {
  /**
   * The optional description for the update or deletion.
   */
  description?: string;
  /**
   * The optional {@link MessageDetailsMetadata} associated with the update or deletion.
   */
  metadata?: MessageDetailsMetadata;
}

/**
 * Represents a single message in a chat room.
 */
export interface Message {
  /**
   * The unique identifier of the message.
   * @deprecated Use `serial` instead.
   */
  readonly timeserial: string;

  /**
   * The unique identifier of the message.
   */
  readonly serial: string;

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
   * The timestamp at which the message was deleted. If the message has not been deleted, this
   * value is undefined.
   */
  readonly deletedAt?: Date;

  /**
   * The clientId of the user who deleted the message.
   * If the message has not been deleted, or has been deleted by a connection without a clientId (such as requests made
   * using an API key only), this value is undefined.
   */
  readonly deletedBy?: string;

  /**
   * The {@link MessageDetails} of the deletion. If the message has not been deleted, this value is undefined.
   * Contains the optional description for deletion and any additional optional metadata associated with the
   * deletion.
   */
  readonly deletionDetail?: MessageDetails;

  /**
   * The timestamp at which the message was updated.
   * If the message has not been updated, this value is undefined.
   */
  readonly updatedAt?: Date;

  /**
   * The clientId of the user who updated the message.
   * If the message has not been updated, or has been updated by a connection without a clientId (such as requests made
   * using an API key only), this value is undefined.
   */
  readonly updatedBy?: string;

  /**
   * The {@link MessageDetails} of the latest update. If the message has not been updated, this value is undefined.
   * Contains the optional reason for update and any additional optional metadata associated with the update.
   */
  readonly updateDetail?: MessageDetails;

  /**
   * Determines if this message has been deleted.
   * @returns true if the message has been deleted.
   */
  isDeleted(): boolean;

  /**
   * Determines if this message has been updated.
   * @returns true if the message has been updated.
   */
  isUpdated(): boolean;

  /**
   * Determines if this message was created before the given message. This comparison is based on
   * global order, so does not necessarily represent the order that messages are received in realtime
   * from the backend.
   * @param message The message to compare against.
   * @returns true if this message was created before the given message, in global order.
   * @throws {@link ErrorInfo} if serials of either message is invalid.
   */
  before(message: Message): boolean;

  /**
   * Determines if this message was created after the given message. This comparison is based on
   * global order, so does not necessarily represent the order that messages are received in realtime
   * from the backend.
   * @param message The message to compare against.
   * @returns true if this message was created after the given message, in global order.
   * @throws {@link ErrorInfo} if serials of either message is invalid.
   */
  after(message: Message): boolean;

  /**
   * Determines if this message is equal to the given message.
   * @param message The message to compare against.
   * @returns true if this message is equal to the given message.
   * @throws {@link ErrorInfo} if serials of either message is invalid.
   */
  equal(message: Message): boolean;
}

/**
 * An implementation of the Message interface for chat messages.
 *
 * Allows for comparison of messages based on their serials.
 */
export class DefaultMessage implements Message {
  private readonly _calculatedSerial: Serial;
  public readonly timeserial: string;

  constructor(
    public readonly serial: string,
    public readonly clientId: string,
    public readonly roomId: string,
    public readonly text: string,
    public readonly createdAt: Date,
    public readonly metadata: MessageMetadata,
    public readonly headers: MessageHeaders,
    public readonly deletedAt?: Date,
    public readonly deletedBy?: string,
    public readonly deletionDetail?: MessageDetails,
    public readonly updatedAt?: Date,
    public readonly updatedBy?: string,
    public readonly updateDetail?: MessageDetails,
  ) {
    this._calculatedSerial = DefaultSerial.calculateSerial(serial);

    this.timeserial = serial; // Deprecated, use serial instead

    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }

  isDeleted(): boolean {
    return this.deletedAt !== undefined;
  }

  isUpdated(): boolean {
    return this.updatedAt !== undefined;
  }

  before(message: Message): boolean {
    return this._calculatedSerial.before(message.serial);
  }

  after(message: Message): boolean {
    return this._calculatedSerial.after(message.serial);
  }

  equal(message: Message): boolean {
    return this._calculatedSerial.equal(message.serial);
  }
}
