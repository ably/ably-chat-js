import * as Ably from 'ably';
import { Message } from './message.js';
import { Reaction } from './reaction.js';
/**
 * Enum for chat entity types. This is used to determine the type of entity encoded in an inboundMessage-like object, and
 * subsequently which method should be used to parse the entity.
 */
export declare enum ChatEntityType {
    /**
     * Represents a chat message type.
     */
    ChatMessage = "chatMessage",
    /**
     * Represents a reaction type.
     */
    Reaction = "reaction"
}
/**
 * A method to determine the type of entity encoded in an inboundMessage-like object.
 *
 * @param encoded - The deserialized inboundMessage-like object.
 * @returns {'chatMessage' | 'reaction'} The type of entity encoded in the message.
 * @throws {@link ErrorInfo} - If there is an error extracting the entity type from the message
 */
export declare function getEntityTypeFromEncoded(encoded: unknown): 'chatMessage' | 'reaction';
/**
 * A method to create a chat message from a deserialized inboundMessage-like object encoded by Ably.
 *
 * @param {unknown} encoded - The deserialized inboundMessage-like object.
 * encryption options if you have chosen to encrypt the messages sent to your integration.
 * @returns {Promise<Message>} A promise that resolves with a chat message.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export declare function chatMessageFromEncoded(encoded: unknown): Promise<Message>;
/**
 * A method to create a reaction from a deserialized inboundMessage-like object encoded by Ably.
 *
 * @param {unknown} encoded - The deserialized inboundMessage-like object.
 * encryption options if you have chosen to encrypt the messages sent to your integration.
 * @returns {Promise<Reaction>} A promise that resolves with a reaction.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export declare function reactionFromEncoded(encoded: unknown): Promise<Reaction>;
/**
 * A method to determine the type of entity in an inboundMessage object.
 *
 * @param message - The Ably inboundMessage object.
 * @returns {ChatEntityType} The type of chat entity of the message.
 * @throws {@link ErrorInfo} - If there is an error extracting the entity type from the message
 */
export declare function getEntityTypeFromAblyMessage(message: Ably.InboundMessage): ChatEntityType;
/**
 * Converts an Ably inboundMessage to a reaction. You can use the `getEntityTypeFromAblyMessage` method to determine
 * if the type of the entity is a reaction before calling this method.
 *
 * @param {Ably.InboundMessage} ablyMessage - The inbound Ably message to convert.
 * @returns Reaction - The converted reaction.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export declare function reactionFromAblyMessage(ablyMessage: Ably.InboundMessage): Reaction;
/**
 * Converts an Ably inboundMessage to a chat message. You can use the `getEntityTypeFromAblyMessage` method to determine
 * if the type of the entity is a chat message before calling this method.
 *
 * @param {Ably.InboundMessage} ablyMessage - The inbound Ably message to convert.
 * @returns Message - The converted chat message.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export declare function chatMessageFromAblyMessage(ablyMessage: Ably.InboundMessage): Message;
