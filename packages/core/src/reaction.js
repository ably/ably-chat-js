/**
 * An implementation of the Reaction interface for room-level reactions.
 */
export class DefaultReaction {
    constructor(type, clientId, createdAt, isSelf, metadata, headers) {
        this.type = type;
        this.clientId = clientId;
        this.createdAt = createdAt;
        this.isSelf = isSelf;
        this.metadata = metadata;
        this.headers = headers;
        // The object is frozen after constructing to enforce readonly at runtime too
        Object.freeze(this);
    }
}
//# sourceMappingURL=reaction.js.map