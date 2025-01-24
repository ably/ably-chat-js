import { ErrorInfo } from 'ably';
import { ChatMessageActions } from './events.js';
/**
 * An implementation of the Message interface for chat messages.
 *
 * Allows for comparison of messages based on their serials.
 */
export class DefaultMessage {
    constructor(serial, clientId, roomId, text, metadata, headers, action, version, createdAt, timestamp, operation) {
        this.serial = serial;
        this.clientId = clientId;
        this.roomId = roomId;
        this.text = text;
        this.metadata = metadata;
        this.headers = headers;
        this.action = action;
        this.version = version;
        this.createdAt = createdAt;
        this.timestamp = timestamp;
        this.operation = operation;
        // The object is frozen after constructing to enforce readonly at runtime too
        Object.freeze(this);
    }
    get isUpdated() {
        return this.action === ChatMessageActions.MessageUpdate;
    }
    get isDeleted() {
        return this.action === ChatMessageActions.MessageDelete;
    }
    get updatedBy() {
        var _a;
        return this.isUpdated ? (_a = this.operation) === null || _a === void 0 ? void 0 : _a.clientId : undefined;
    }
    get deletedBy() {
        var _a;
        return this.isDeleted ? (_a = this.operation) === null || _a === void 0 ? void 0 : _a.clientId : undefined;
    }
    get updatedAt() {
        return this.isUpdated ? this.timestamp : undefined;
    }
    get deletedAt() {
        return this.isDeleted ? this.timestamp : undefined;
    }
    versionBefore(message) {
        // Check to ensure the messages are the same before comparing operation order
        if (!this.equal(message)) {
            throw new ErrorInfo('versionBefore(): Cannot compare versions, message serials must be equal', 50000, 500);
        }
        return this.version < message.version;
    }
    versionAfter(message) {
        // Check to ensure the messages are the same before comparing operation order
        if (!this.equal(message)) {
            throw new ErrorInfo('versionAfter(): Cannot compare versions, message serials must be equal', 50000, 500);
        }
        return this.version > message.version;
    }
    versionEqual(message) {
        // Check to ensure the messages are the same before comparing operation order
        if (!this.equal(message)) {
            throw new ErrorInfo('versionEqual(): Cannot compare versions, message serials must be equal', 50000, 500);
        }
        return this.version === message.version;
    }
    before(message) {
        return this.serial < message.serial;
    }
    after(message) {
        return this.serial > message.serial;
    }
    equal(message) {
        return this.serial === message.serial;
    }
}
//# sourceMappingURL=message.js.map