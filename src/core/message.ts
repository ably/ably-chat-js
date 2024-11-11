import { ErrorInfo } from 'ably';

import { ActionMetadata } from './action-metadata.js';
import { ChatMessageActions } from './events.js';
import { Headers } from './headers.js';
import { Metadata } from './metadata.js';
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
 * {@link ActionMetadata} type for a chat messages {@link MessageActionDetails}.
 */
export type MessageActionMetadata = ActionMetadata;

/**
 * Represents the detail of a message deletion or update.
 */
export interface MessageActionDetails {
  /**
   * The optional clientId of the user who performed the update or deletion.
   */
  clientId?: string;
  /**
   * The optional description for the update or deletion.
   */
  description?: string;
  /**
   * The optional metadata associated with the update or deletion.
   */
  metadata?: MessageActionMetadata;
}

/**
 * Represents a single message in a chat room.
 */
export interface Message {
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
   * The latest action of the message. This can be used to determine if the message was created, updated, or deleted.
   */
  readonly latestAction: ChatMessageActions;

  /**
   * A unique identifier for the latest action that updated the message. This is only set for update and deletes.
   */
  readonly latestActionSerial: string;

  /**
   * The details of the latest action that updated the message. This is only set for update and delete actions.
   */
  readonly latestActionDetails?: MessageActionDetails;

  /**
   * Indicates if the message has been updated.
   */
  readonly isUpdated: boolean;

  /**
   * Indicates if the message has been deleted.
   */
  readonly isDeleted: boolean;

  /**
   * The clientId of the user who deleted the message.
   */
  readonly deletedBy?: string;

  /**
   * The clientId of the user who updated the message.
   */
  readonly updatedBy?: string;

  /**
   * The timestamp at which the message was deleted.
   */
  readonly deletedAt?: Date;

  /**
   * The timestamp at which the message was updated.
   */
  readonly updatedAt?: Date;

  /**
   * Determines if the action of this message is before the action of the given message.
   * @param message The message to compare against.
   * @returns true if the action of this message is before the given message.
   * @throws {@link ErrorInfo} if both message serials do not match, or if {@link latestActionSerial} of either is invalid.
   */
  actionBefore(message: Message): boolean;

  /**
   * Determines if the action of this message is after the action of the given message.
   * @param message The message to compare against.
   * @returns true if the action of this message is after the given message.
   * @throws {@link ErrorInfo} if both message serials do not match, or if {@link latestActionSerial} of either is invalid.
   */
  actionAfter(message: Message): boolean;

  /**
   * Determines if the action of this message is equal to the action of the given message.
   * @param message The message to compare against.
   * @returns true if the action of this message is equal to the given message.
   * @throws {@link ErrorInfo} if both message serials do not match, or if {@link latestActionSerial} of either is invalid.
   */
  actionEqual(message: Message): boolean;

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
  private readonly _calculatedOriginSerial: Serial;
  private readonly _calculatedActionSerial: Serial;
  public readonly createdAt: Date;

  constructor(
    public readonly serial: string,
    public readonly clientId: string,
    public readonly roomId: string,
    public readonly text: string,
    public readonly metadata: MessageMetadata,
    public readonly headers: MessageHeaders,
    public readonly latestAction: ChatMessageActions,

    // the `latestActionSerial` will be set to the current message `serial` for new messages,
    // else it will be set to the `updateSerial` corresponding to whatever action
    // (update/delete) that was just performed.
    public readonly latestActionSerial: string,
    public readonly deletedAt?: Date,
    public readonly updatedAt?: Date,
    public readonly latestActionDetails?: MessageActionDetails,
  ) {
    this._calculatedOriginSerial = DefaultSerial.calculateSerial(serial);
    this._calculatedActionSerial = DefaultSerial.calculateSerial(latestActionSerial);
    this.createdAt = new Date(this._calculatedOriginSerial.timestamp);

    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }

  get isUpdated(): boolean {
    return this.updatedAt !== undefined;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== undefined;
  }

  get updatedBy(): string | undefined {
    return this.latestAction === ChatMessageActions.MessageUpdate ? this.latestActionDetails?.clientId : undefined;
  }

  get deletedBy(): string | undefined {
    return this.latestAction === ChatMessageActions.MessageDelete ? this.latestActionDetails?.clientId : undefined;
  }

  actionBefore(message: Message): boolean {
    // Check to ensure the messages are the same before comparing operation order
    if (!this.equal(message)) {
      throw new ErrorInfo('actionBefore(): Cannot compare actions, message serials must be equal', 50000, 500);
    }
    return this._calculatedActionSerial.before(message.latestActionSerial);
  }

  actionAfter(message: Message): boolean {
    // Check to ensure the messages are the same before comparing operation order
    if (!this.equal(message)) {
      throw new ErrorInfo('actionAfter(): Cannot compare actions, message serials must be equal', 50000, 500);
    }
    return this._calculatedActionSerial.after(message.latestActionSerial);
  }

  actionEqual(message: Message): boolean {
    // Check to ensure the messages are the same before comparing operation order
    if (!this.equal(message)) {
      throw new ErrorInfo('actionEqual(): Cannot compare actions, message serials must be equal', 50000, 500);
    }
    return this._calculatedActionSerial.equal(message.latestActionSerial);
  }

  before(message: Message): boolean {
    return this._calculatedOriginSerial.before(message.serial);
  }

  after(message: Message): boolean {
    return this._calculatedOriginSerial.after(message.serial);
  }

  equal(message: Message): boolean {
    return this._calculatedOriginSerial.equal(message.serial);
  }
}
