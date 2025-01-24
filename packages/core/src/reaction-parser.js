import * as Ably from 'ably';
import { DefaultReaction } from './reaction.js';
export function parseReaction(message, clientId) {
    var _a, _b, _c;
    const reactionCreatedMessage = message;
    if (!reactionCreatedMessage.data) {
        throw new Ably.ErrorInfo(`received incoming message without data`, 50000, 500);
    }
    if (!reactionCreatedMessage.data.type || typeof reactionCreatedMessage.data.type !== 'string') {
        throw new Ably.ErrorInfo('invalid reaction message with no type', 50000, 500);
    }
    if (!reactionCreatedMessage.clientId) {
        throw new Ably.ErrorInfo(`received incoming message without clientId`, 50000, 500);
    }
    if (!reactionCreatedMessage.timestamp) {
        throw new Ably.ErrorInfo(`received incoming message without timestamp`, 50000, 500);
    }
    return new DefaultReaction(reactionCreatedMessage.data.type, reactionCreatedMessage.clientId, new Date(reactionCreatedMessage.timestamp), clientId ? clientId === reactionCreatedMessage.clientId : false, (_a = reactionCreatedMessage.data.metadata) !== null && _a !== void 0 ? _a : {}, (_c = (_b = reactionCreatedMessage.extras) === null || _b === void 0 ? void 0 : _b.headers) !== null && _c !== void 0 ? _c : {});
}
//# sourceMappingURL=reaction-parser.js.map