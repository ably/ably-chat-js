import * as Ably from 'ably';
import { ChatMessageActions } from './events.js';
import { DefaultMessage } from './message.js';
// Parse a realtime message to a chat message
export function parseMessage(roomId, inboundMessage) {
    var _a, _b;
    const message = inboundMessage;
    if (!roomId) {
        throw new Ably.ErrorInfo(`received incoming message without roomId`, 50000, 500);
    }
    if (!message.data) {
        throw new Ably.ErrorInfo(`received incoming message without data`, 50000, 500);
    }
    if (!message.clientId) {
        throw new Ably.ErrorInfo(`received incoming message without clientId`, 50000, 500);
    }
    if (message.data.text === undefined) {
        throw new Ably.ErrorInfo(`received incoming message without text`, 50000, 500);
    }
    if (!message.extras) {
        throw new Ably.ErrorInfo(`received incoming message without extras`, 50000, 500);
    }
    if (!message.serial) {
        throw new Ably.ErrorInfo(`received incoming message without serial`, 50000, 500);
    }
    if (!message.version) {
        throw new Ably.ErrorInfo(`received incoming message without version`, 50000, 500);
    }
    if (!message.createdAt) {
        throw new Ably.ErrorInfo(`received incoming message without createdAt`, 50000, 500);
    }
    if (!message.timestamp) {
        throw new Ably.ErrorInfo(`received incoming message without timestamp`, 50000, 500);
    }
    switch (message.action) {
        case ChatMessageActions.MessageCreate:
        case ChatMessageActions.MessageUpdate:
        case ChatMessageActions.MessageDelete: {
            break;
        }
        default: {
            throw new Ably.ErrorInfo(`received incoming message with unhandled action; ${message.action}`, 50000, 500);
        }
    }
    return new DefaultMessage(message.serial, message.clientId, roomId, message.data.text, (_a = message.data.metadata) !== null && _a !== void 0 ? _a : {}, (_b = message.extras.headers) !== null && _b !== void 0 ? _b : {}, message.action, message.version, new Date(message.createdAt), new Date(message.timestamp), message.operation);
}
//# sourceMappingURL=message-parser.js.map