import * as Ably from 'ably';
import cloneDeep from 'lodash.clonedeep';

import { ErrorCode } from './errors.js';
import {
  ChatMessageAction,
  ChatMessageEvent,
  ChatMessageEventType,
  MessageReactionSummaryEvent,
  MessageReactionSummaryEventType,
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
 * {@link OperationMetadata} type for a chat message. Contains information about an update or deletion operation.
 */
export type MessageOperationMetadata = OperationMetadata;

/**
 * Represents the detail of a message deletion or update.
 */
export interface MessageVersion {
  /**
   * A unique identifier for the latest version of this message.
   */
  serial: string;

  /**
   * The timestamp at which this version was updated, deleted, or created.
   */
  timestamp: Date;

  /**
   * The optional clientId of the user who performed an update or deletion.
   */
  clientId?: string;

  /**
   * The optional description for an update or deletion.
   */
  description?: string;

  /**
   * The optional metadata associated with an update or deletion.
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
  readonly timestamp: Date;

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
   *
   * If you need per-room authoritative information on messages, consider using
   * {@link userClaim} via JWT user claims instead.
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
   *
   * If you need per-room authoritative information on messages, consider using
   * {@link userClaim} via JWT user claims instead.
   */
  readonly headers: MessageHeaders;

  /**
   * The user claim attached to this message by the server. This is set automatically
   * by the Ably server when a JWT contains a matching `ably.room.<roomName>` claim.
   *
   * This value is only present if the publishing user's token contained a claim
   * for the room in which this message was published.
   */
  readonly userClaim?: string;

  /**
   * The action type of the message. This can be used to determine if the message was created, updated, or deleted.
   */
  readonly action: ChatMessageAction;

  /**
   * Information about the latest version of this message.
   */
  readonly version: MessageVersion;

  /**
   * The reactions summary for this message.
   */
  readonly reactions: MessageReactionSummary;

  /**
   * Creates a new message instance with the event applied.
   *
   * **NOTE**: This method will not replace the message reactions if the event is of type `Message`.
   * @param event The event to be applied to the returned message.
   * @throws An {@link Ably.ErrorInfo} if the event is for a different message.
   * @throws An {@link Ably.ErrorInfo} if the event is a {@link ChatMessageEventType.Created}.
   * @returns A new message instance with the event applied. If the event is a no-op, such
   *    as an event for an old version, the same message is returned (not a copy).
   */
  with(event: Message | ChatMessageEvent | MessageReactionSummaryEvent): Message;

  /**
   * Creates a copy of the message with fields replaced per the parameters.
   * @param params The parameters to replace in the message.
   * @returns The message copy.
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
export interface MessageReactionSummary {
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
  userClaim?: string;
  action: ChatMessageAction;
  version: MessageVersion;
  timestamp: Date;
  reactions: MessageReactionSummary;
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
  public readonly userClaim?: string;
  public readonly action: ChatMessageAction;
  public readonly version: MessageVersion;
  public readonly timestamp: Date;
  public readonly reactions: MessageReactionSummary;

  constructor({
    serial,
    clientId,
    text,
    metadata,
    headers,
    userClaim,
    action,
    version,
    timestamp,
    reactions,
  }: DefaultMessageParams) {
    this.serial = serial;
    this.clientId = clientId;
    this.text = text;
    this.metadata = metadata;
    this.headers = headers;
    this.userClaim = userClaim;
    this.action = action;
    this.version = version;
    this.timestamp = timestamp;
    this.reactions = reactions;
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this.version);
    Object.freeze(this.reactions);
    Object.freeze(this.reactions.multiple);
    Object.freeze(this.reactions.distinct);
    Object.freeze(this.reactions.unique);
    Object.freeze(this);
  }

  with(event: Message | ChatMessageEvent | MessageReactionSummaryEvent): Message {
    // If event has the property "serial", then it's a message
    if ('serial' in event) {
      return this._getLatestMessageVersion(event);
    }

    // If the event is a created event, throw an error
    if (event.type === ChatMessageEventType.Created) {
      throw new Ably.ErrorInfo(
        'unable to apply message event; unable to apply created event to existing message',
        ErrorCode.InvalidArgument,
        400,
      );
    }

    // reaction summary
    if (event.type === MessageReactionSummaryEventType.Summary) {
      if (event.messageSerial !== this.serial) {
        throw new Ably.ErrorInfo(
          'unable to apply message event; event is for a different message',
          ErrorCode.InvalidArgument,
          400,
        );
      }

      const newReactions: MessageReactionSummary = {
        unique: cloneDeep(event.reactions.unique),
        distinct: cloneDeep(event.reactions.distinct),
        multiple: cloneDeep(event.reactions.multiple),
      };

      return DefaultMessage._clone(this, { reactions: newReactions });
    }

    // Message event (update or delete)
    return this._getLatestMessageVersion(event.message);
  }

  /**
   * Get the latest message version, based on the event.
   * If "this" is the latest version, return "this", otherwise clone the message and apply the reactions.
   * @param message The message to get the latest version of
   * @returns The latest message version
   */
  private _getLatestMessageVersion(message: Message): Message {
    // message event (update or delete)
    if (message.serial !== this.serial) {
      throw new Ably.ErrorInfo(
        'unable to apply message event; event is for a different message',
        ErrorCode.InvalidArgument,
        400,
      );
    }

    // event is older, keep this instead
    if (this.version.serial >= message.version.serial) {
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
      userClaim: replace?.userClaim ?? source.userClaim,
      action: replace?.action ?? source.action,
      version: replace?.version ?? cloneDeep(source.version),
      timestamp: replace?.timestamp ?? source.timestamp,
      reactions: replace?.reactions ?? cloneDeep(source.reactions),
    });
  }

  copy(params: MessageCopyParams = {}): Message {
    return DefaultMessage._clone(this, params);
  }
}

/**
 * Creates an empty MessageReactionSummary object with empty unique and distinct reaction collections.
 * @returns An empty MessageReactionSummary object.
 */
export const emptyMessageReactions = (): MessageReactionSummary => ({
  unique: {},
  distinct: {},
  multiple: {},
});
