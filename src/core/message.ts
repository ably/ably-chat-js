import { ErrorInfo } from 'ably';

import { ChatMessageActions } from './events.js';
import { Headers } from './headers.js';
import { Metadata } from './metadata.js';
import { OperationMetadata } from './operation-metadata.js';

/**
 * {@link Headers} type for chat messages.
 */
export type MessageHeaders = Headers;

/**
 * {@link Metadata} type for chat messages.
 */
export type MessageMetadata = Metadata;

/**
 * {@link OperationMetadata} type for a chat messages {@link Operation}.
 */
export type MessageOperationMetadata = OperationMetadata;

/**
 * Represents the detail of a message deletion or update.
 */
export interface Operation {
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
  metadata?: MessageOperationMetadata;
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
   * The action type of the message. This can be used to determine if the message was created, updated, or deleted.
   */
  readonly action: ChatMessageActions;

  /**
   * A unique identifier for the latest version of this message.
   */
  readonly version: string;

  /**
   * The timestamp at which this version was updated, deleted, or created.
   */
  readonly timestamp: Date;

  /**
   * The details of the operation that updated the message. This is only set for update and delete actions. It contains
   * information about the operation: the clientId of the user who performed the operation, a description, and metadata.
   */
  readonly operation?: Operation;

  /**
   * Indicates if the message has been updated.
   */
  get isUpdated(): boolean;

  /**
   * Indicates if the message has been deleted.
   */
  get isDeleted(): boolean;

  /**
   * The clientId of the user who deleted the message.
   */
  get deletedBy(): string | undefined;

  /**
   * The clientId of the user who updated the message.
   */
  get updatedBy(): string | undefined;

  /**
   * The timestamp at which the message was deleted.
   */
  get deletedAt(): Date | undefined;

  /**
   * The timestamp at which the message was updated.
   */
  get updatedAt(): Date | undefined;

  /**
   * Determines if the version of this message is older than the version of the given message.
   * @param message The message to compare against.
   * @returns true if the version of this message is before the given message.
   * @throws {@link ErrorInfo} if both message serials do not match.
   */
  versionBefore(message: Message): boolean;

  /**
   * Determines if the version of this message is newer than the version of the given message.
   * @param message The message to compare against.
   * @returns true if the version of this message is after the given message.
   * @throws {@link ErrorInfo} if both message serials do not match.
   */
  versionAfter(message: Message): boolean;

  /**
   * Determines if the version of this message is the same as to the version of the given message.
   * @param message The message to compare against.
   * @returns true if the version of this message is equal to the given message.
   * @throws {@link ErrorInfo} if both message serials do not match.
   */
  versionEqual(message: Message): boolean;

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
   *
   * Note that this method compares messages based on {@link Message.serial} alone. It returns true if the
   * two messages represent different versions of the same message.
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
  constructor(
    public readonly serial: string,
    public readonly clientId: string,
    public readonly roomId: string,
    public readonly text: string,
    public readonly metadata: MessageMetadata,
    public readonly headers: MessageHeaders,
    public readonly action: ChatMessageActions,
    public readonly version: string,
    public readonly createdAt: Date,
    public readonly timestamp: Date,
    public readonly operation?: Operation,
  ) {
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }

  get isUpdated(): boolean {
    return this.action === ChatMessageActions.MessageUpdate;
  }

  get isDeleted(): boolean {
    return this.action === ChatMessageActions.MessageDelete;
  }

  get updatedBy(): string | undefined {
    return this.isUpdated ? this.operation?.clientId : undefined;
  }

  get deletedBy(): string | undefined {
    return this.isDeleted ? this.operation?.clientId : undefined;
  }

  get updatedAt(): Date | undefined {
    return this.isUpdated ? this.timestamp : undefined;
  }

  get deletedAt(): Date | undefined {
    return this.isDeleted ? this.timestamp : undefined;
  }

  versionBefore(message: Message): boolean {
    // Check to ensure the messages are the same before comparing operation order
    if (!this.equal(message)) {
      throw new ErrorInfo('versionBefore(): Cannot compare versions, message serials must be equal', 50000, 500);
    }

    return this.version < message.version;
  }

  versionAfter(message: Message): boolean {
    // Check to ensure the messages are the same before comparing operation order
    if (!this.equal(message)) {
      throw new ErrorInfo('versionAfter(): Cannot compare versions, message serials must be equal', 50000, 500);
    }

    return this.version > message.version;
  }

  versionEqual(message: Message): boolean {
    // Check to ensure the messages are the same before comparing operation order
    if (!this.equal(message)) {
      throw new ErrorInfo('versionEqual(): Cannot compare versions, message serials must be equal', 50000, 500);
    }

    return this.version === message.version;
  }

  before(message: Message): boolean {
    return this.serial < message.serial;
  }

  after(message: Message): boolean {
    return this.serial > message.serial;
  }

  equal(message: Message): boolean {
    return this.serial === message.serial;
  }
}
