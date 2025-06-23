import * as Ably from 'ably';
import cloneDeep from 'lodash.clonedeep';

import {
  ChatMessageAction,
  ChatMessageEvent,
  ChatMessageEventType,
  MessageReactionEventType,
  MessageReactionSummaryEvent,
} from './events.js';
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
   * validation. When reading the headers, treat them like user input.
   */
  readonly headers: MessageHeaders;

  /**
   * The action type of the message. This can be used to determine if the message was created, updated, or deleted.
   */
  readonly action: ChatMessageAction;

  /**
   * A unique identifier for the latest version of this message.
   */
  readonly version: string;

  /**
   * The timestamp at which this version was updated, deleted, or created.
   */
  readonly timestamp: Date;

  /**
   * The details of the operation that modified the message. This is only set for update and delete actions. It contains
   * information about the operation: the clientId of the user who performed the operation, a description, and metadata.
   */
  readonly operation?: Operation;

  /**
   * The reactions summary for this message.
   */
  readonly reactions: MessageReactions;

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
   * Determines if this message is an older version of the given message.
   *
   * **Note** that negating this function does not mean that the message is a newer
   * version of the same message, as the two may be different messages entirely.
   *
   * ```ts
   *  !message.isOlderVersionOf(other) !== message.isNewerVersionOf(other)
   * ```
   * @param message The message to compare against.
   * @returns true if the two messages are the same message (isSameAs returns true) and this message is an older version.
   */
  isOlderVersionOf(message: Message): boolean;

  /**
   * Determines if this message is a newer version of the given message.
   *
   * **Note** that negating this function does not mean that the message is an older
   * version of the same message, as the two may be different messages entirely.
   *
   * ```ts
   *  !message.isNewerVersionOf(other) !== message.isOlderVersionOf(other)
   * ```
   *
   * @param message The message to compare against.
   * @returns true if the two messages are the same message (isSameAs returns true) and this message is a newer version.
   */
  isNewerVersionOf(message: Message): boolean;

  /**
   * Determines if this message is the same version as the given message.
   * @param message The message to compare against.
   * @returns true if the two messages are the same message and have the same version.
   */
  isSameVersionAs(message: Message): boolean;

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
   * @returns true if the two messages are the same message.
   */
  equal(message: Message): boolean;

  /**
   * Alias for {@link equal}.
   * @param message The message to compare against.
   * @returns true if the two messages are the same message.
   */
  isSameAs(message: Message): boolean;

  /**
   * Creates a new message instance with the event applied.
   *
   * NOTE: This method will not replace the message reactions if the event is of type `Message`.
   *
   * @param event The event to be applied to the returned message.
   * @throws {@link ErrorInfo} if the event is for a different message.
   * @throws {@link ErrorInfo} if the event is a {@link ChatMessageEventType.Created}.
   * @returns A new message instance with the event applied. If the event is a no-op, such
   *    as an event for an old version, the same message is returned (not a copy).
   */
  with(event: Message | ChatMessageEvent | MessageReactionSummaryEvent): Message;

  /**
   * Creates a copy of the message with fields replaced per the parameters.
   *
   * @param params The parameters to replace in the message.
   * @return The message copy.
   */
  copy(params?: MessageCopyParams): Message;
}

/**
 * Parameters for copying a message.
 */
export interface MessageCopyParams {
  /**
   * The text of the copied message.
   */
  text?: string;

  /**
   * The metadata of the copied message.
   */
  metadata?: MessageMetadata;

  /**
   * The headers of the copied message.
   */
  headers?: MessageHeaders;
}

/**
 * Represents a summary of all reactions on a message.
 */
export interface MessageReactions {
  /**
   * Map of reaction to the summary (total and clients) for reactions of type {@link MessageReactionType.Unique}.
   */
  unique: Ably.SummaryUniqueValues;

  /**
   * Map of reaction to the summary (total and clients) for reactions of type {@link MessageReactionType.Distinct}.
   */
  distinct: Ably.SummaryDistinctValues;

  /**
   * Map of reaction to the summary (total and clients) for reactions of type {@link MessageReactionType.Multiple}.
   */
  multiple: Ably.SummaryMultipleValues;
}

/**
 * Parameters for creating a new DefaultMessage instance.
 */
export interface DefaultMessageParams {
  serial: string;
  clientId: string;
  text: string;
  metadata: MessageMetadata;
  headers: MessageHeaders;
  action: ChatMessageAction;
  version: string;
  createdAt: Date;
  timestamp: Date;
  reactions: MessageReactions;
  operation?: Operation;
}

/**
 * An implementation of the Message interface for chat messages.
 *
 * Allows for comparison of messages based on their serials.
 */
export class DefaultMessage implements Message {
  public readonly serial: string;
  public readonly clientId: string;
  public readonly text: string;
  public readonly metadata: MessageMetadata;
  public readonly headers: MessageHeaders;
  public readonly action: ChatMessageAction;
  public readonly version: string;
  public readonly createdAt: Date;
  public readonly timestamp: Date;
  public readonly reactions: MessageReactions;
  public readonly operation?: Operation;

  constructor({
    serial,
    clientId,
    text,
    metadata,
    headers,
    action,
    version,
    createdAt,
    timestamp,
    reactions,
    operation,
  }: DefaultMessageParams) {
    this.serial = serial;
    this.clientId = clientId;
    this.text = text;
    this.metadata = metadata;
    this.headers = headers;
    this.action = action;
    this.version = version;
    this.createdAt = createdAt;
    this.timestamp = timestamp;
    this.reactions = reactions;
    this.operation = operation;
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this.reactions);
    Object.freeze(this.reactions.multiple);
    Object.freeze(this.reactions.distinct);
    Object.freeze(this.reactions.unique);
    Object.freeze(this);
  }

  get isUpdated(): boolean {
    return this.action === ChatMessageAction.MessageUpdate;
  }

  get isDeleted(): boolean {
    return this.action === ChatMessageAction.MessageDelete;
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

  isOlderVersionOf(message: Message): boolean {
    if (!this.equal(message)) {
      return false;
    }

    return this.version < message.version;
  }

  isNewerVersionOf(message: Message): boolean {
    if (!this.equal(message)) {
      return false;
    }

    return this.version > message.version;
  }

  isSameVersionAs(message: Message): boolean {
    if (!this.equal(message)) {
      return false;
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

  isSameAs(message: Message): boolean {
    return this.equal(message);
  }

  with(event: Message | ChatMessageEvent | MessageReactionSummaryEvent): Message {
    // If event has the property "serial", then it's a message
    if ('serial' in event) {
      return this._getLatestMessageVersion(event);
    }

    // If the event is a created event, throw an error
    if (event.type === ChatMessageEventType.Created) {
      throw new Ably.ErrorInfo('cannot apply a created event to a message', 40000, 400);
    }

    // reaction summary
    if (event.type === MessageReactionEventType.Summary) {
      if (event.summary.messageSerial !== this.serial) {
        throw new Ably.ErrorInfo('cannot apply event for a different message', 40000, 400);
      }

      const newReactions: MessageReactions = {
        unique: cloneDeep(event.summary.unique),
        distinct: cloneDeep(event.summary.distinct),
        multiple: cloneDeep(event.summary.multiple),
      };

      return DefaultMessage._clone(this, { reactions: newReactions });
    }

    // Message event (update or delete)
    return this._getLatestMessageVersion(event.message);
  }

  /**
   * Get the latest message version, based on the event.
   * If "this" is the latest version, return "this", otherwise clone the message and apply the reactions.
   *
   * @param message The message to get the latest version of
   * @returns The latest message version
   */
  private _getLatestMessageVersion(message: Message): Message {
    // message event (update or delete)
    if (message.serial !== this.serial) {
      throw new Ably.ErrorInfo('cannot apply event for a different message', 40000, 400);
    }

    // event is older, keep this instead
    if (this.version >= message.version) {
      return this;
    }

    // event is newer, copy reactions from this and make new message from event
    // TODO: This ignores summaries being newer on the message passed in, and is something we need to address
    return DefaultMessage._clone(message, { reactions: this.reactions });
  }

  // Clone a message, optionally replace the given fields
  private static _clone(source: Message, replace?: Partial<Message>): DefaultMessage {
    return new DefaultMessage({
      serial: replace?.serial ?? source.serial,
      clientId: replace?.clientId ?? source.clientId,
      text: replace?.text ?? source.text,
      metadata: replace?.metadata ?? cloneDeep(source.metadata),
      headers: replace?.headers ?? cloneDeep(source.headers),
      action: replace?.action ?? source.action,
      version: replace?.version ?? source.version,
      createdAt: replace?.createdAt ?? source.createdAt,
      timestamp: replace?.timestamp ?? source.timestamp,
      reactions: replace?.reactions ?? cloneDeep(source.reactions),
      operation: replace?.operation ?? cloneDeep(source.operation),
    });
  }

  copy(params: MessageCopyParams = {}): Message {
    return DefaultMessage._clone(this, params);
  }
}

export function emptyMessageReactions(): MessageReactions {
  return {
    unique: {},
    distinct: {},
    multiple: {},
  };
}
