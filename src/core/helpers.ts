import * as Ably from 'ably';

import { MessageEvents, RoomReactionEvents } from './events.js';
import { Message } from './message.js';
import { parseMessage } from './message-parser.js';
import { Reaction } from './reaction.js';
import { parseReaction } from './reaction-parser.js';

/**
 * Enum for chat entity types. This is used to determine the type of entity encoded in an inboundMessage-like object, and
 * subsequently which method should be used to parse the entity.
 */
export enum ChatEntityType {
  /**
   * Represents a chat message type.
   */
  ChatMessage = 'chatMessage',
  /**
   * Represents a reaction type.
   */
  Reaction = 'reaction',
}

/**
 * Helper function to validate the encoded object.
 *
 * @param encoded - The object to validate.
 * @throws {@link ErrorInfo} - If the encoded object is invalid.
 */
function validateEncoded(encoded: unknown): void {
  if (typeof encoded !== 'object' || encoded === null) {
    throw new Ably.ErrorInfo('invalid encoded type; encoded is not type object or is null', 40000, 400);
  }

  if (!('name' in encoded) || typeof encoded.name !== 'string') {
    throw new Ably.ErrorInfo('invalid encoded inbound message; message does not have a valid name field', 40000, 400);
  }
}

/**
 * A method to determine the type of entity encoded in an inboundMessage-like object.
 *
 * @param encoded - The deserialized inboundMessage-like object.
 * @returns {'chatMessage' | 'reaction'} The type of entity encoded in the message.
 * @throws {@link ErrorInfo} - If there is an error extracting the entity type from the message
 */
export function getEntityTypeFromEncoded(encoded: unknown): 'chatMessage' | 'reaction' {
  validateEncoded(encoded);
  // At this point, we know that the encoded object is an InboundMessage-like object
  return getEntityTypeFromAblyMessage(encoded as Ably.InboundMessage);
}

/**
 * A method to create a chat message from a deserialized inboundMessage-like object encoded by Ably.
 *
 * @param {unknown} encoded - The deserialized inboundMessage-like object.
 * encryption options if you have chosen to encrypt the messages sent to your integration.
 * @returns {Promise<Message>} A promise that resolves with a chat message.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export async function chatMessageFromEncoded(encoded: unknown): Promise<Message> {
  validateEncoded(encoded);

  const message = await Ably.Realtime.Message.fromEncoded(encoded);

  return chatMessageFromAblyMessage(message);
}

/**
 * A method to create a reaction from a deserialized inboundMessage-like object encoded by Ably.
 *
 * @param {unknown} encoded - The deserialized inboundMessage-like object.
 * encryption options if you have chosen to encrypt the messages sent to your integration.
 * @returns {Promise<Reaction>} A promise that resolves with a reaction.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export async function reactionFromEncoded(encoded: unknown): Promise<Reaction> {
  validateEncoded(encoded);
  const message = await Ably.Realtime.Message.fromEncoded(encoded);
  return reactionFromAblyMessage(message);
}

/**
 * A method to determine the type of entity in an inboundMessage object.
 *
 * @param message - The Ably inboundMessage object.
 * @returns {ChatEntityType} The type of chat entity of the message.
 * @throws {@link ErrorInfo} - If there is an error extracting the entity type from the message
 */
export function getEntityTypeFromAblyMessage(message: Ably.InboundMessage): ChatEntityType {
  switch (message.name) {
    case MessageEvents.Created: {
      return ChatEntityType.ChatMessage;
    }
    case RoomReactionEvents.Reaction: {
      return ChatEntityType.Reaction;
    }
    case undefined: {
      throw new Ably.ErrorInfo(`received incoming message without event name`, 40000, 400);
    }
    default: {
      throw new Ably.ErrorInfo(`unknown message type: ${message.name}`, 40000, 400);
    }
  }
}

/**
 * Converts an Ably inboundMessage to a reaction. You can use the `getEntityTypeFromAblyMessage` method to determine
 * if the type of the entity is a reaction before calling this method.
 *
 * @param {Ably.InboundMessage} ablyMessage - The inbound Ably message to convert.
 * @returns Reaction - The converted reaction.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export function reactionFromAblyMessage(ablyMessage: Ably.InboundMessage): Reaction {
  return parseReaction(ablyMessage);
}

/**
 * Converts an Ably inboundMessage to a chat message. You can use the `getEntityTypeFromAblyMessage` method to determine
 * if the type of the entity is a chat message before calling this method.
 *
 * @param {Ably.InboundMessage} ablyMessage - The inbound Ably message to convert.
 * @returns Message - The converted chat message.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export function chatMessageFromAblyMessage(ablyMessage: Ably.InboundMessage): Message {
  const roomId = ablyMessage.id.split(':')[2];
  return parseMessage(roomId, ablyMessage);
}
