var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as Ably from 'ably';
import { RealtimeMessageNames, RoomReactionEvents } from './events.js';
import { parseMessage } from './message-parser.js';
import { parseReaction } from './reaction-parser.js';
/**
 * Enum for chat entity types. This is used to determine the type of entity encoded in an inboundMessage-like object, and
 * subsequently which method should be used to parse the entity.
 */
export var ChatEntityType;
(function (ChatEntityType) {
    /**
     * Represents a chat message type.
     */
    ChatEntityType["ChatMessage"] = "chatMessage";
    /**
     * Represents a reaction type.
     */
    ChatEntityType["Reaction"] = "reaction";
})(ChatEntityType || (ChatEntityType = {}));
/**
 * Helper function to validate the encoded object.
 *
 * @param encoded - The object to validate.
 * @throws {@link ErrorInfo} - If the encoded object is invalid.
 */
function validateEncoded(encoded) {
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
export function getEntityTypeFromEncoded(encoded) {
    validateEncoded(encoded);
    // At this point, we know that the encoded object is an InboundMessage-like object
    return getEntityTypeFromAblyMessage(encoded);
}
/**
 * A method to create a chat message from a deserialized inboundMessage-like object encoded by Ably.
 *
 * @param {unknown} encoded - The deserialized inboundMessage-like object.
 * encryption options if you have chosen to encrypt the messages sent to your integration.
 * @returns {Promise<Message>} A promise that resolves with a chat message.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export function chatMessageFromEncoded(encoded) {
    return __awaiter(this, void 0, void 0, function* () {
        validateEncoded(encoded);
        const message = yield Ably.Realtime.Message.fromEncoded(encoded);
        return chatMessageFromAblyMessage(message);
    });
}
/**
 * A method to create a reaction from a deserialized inboundMessage-like object encoded by Ably.
 *
 * @param {unknown} encoded - The deserialized inboundMessage-like object.
 * encryption options if you have chosen to encrypt the messages sent to your integration.
 * @returns {Promise<Reaction>} A promise that resolves with a reaction.
 * @throws {@link ErrorInfo} - If there is an error parsing the message.
 */
export function reactionFromEncoded(encoded) {
    return __awaiter(this, void 0, void 0, function* () {
        validateEncoded(encoded);
        const message = yield Ably.Realtime.Message.fromEncoded(encoded);
        return reactionFromAblyMessage(message);
    });
}
/**
 * A method to determine the type of entity in an inboundMessage object.
 *
 * @param message - The Ably inboundMessage object.
 * @returns {ChatEntityType} The type of chat entity of the message.
 * @throws {@link ErrorInfo} - If there is an error extracting the entity type from the message
 */
export function getEntityTypeFromAblyMessage(message) {
    switch (message.name) {
        case RealtimeMessageNames.ChatMessage: {
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
export function reactionFromAblyMessage(ablyMessage) {
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
export function chatMessageFromAblyMessage(ablyMessage) {
    const roomId = ablyMessage.id.split(':')[2];
    return parseMessage(roomId, ablyMessage);
}
//# sourceMappingURL=helpers.js.map