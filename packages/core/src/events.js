/**
 * All chat message events.
 */
export var MessageEvents;
(function (MessageEvents) {
    /** Fires when a new chat message is received. */
    MessageEvents["Created"] = "message.created";
    /** Fires when a chat message is updated. */
    MessageEvents["Updated"] = "message.updated";
    /** Fires when a chat message is deleted. */
    MessageEvents["Deleted"] = "message.deleted";
})(MessageEvents || (MessageEvents = {}));
/**
 * Realtime chat message names.
 */
export var RealtimeMessageNames;
(function (RealtimeMessageNames) {
    /** Represents a regular chat message. */
    RealtimeMessageNames["ChatMessage"] = "chat.message";
})(RealtimeMessageNames || (RealtimeMessageNames = {}));
/**
 * Chat Message Actions.
 */
export var ChatMessageActions;
(function (ChatMessageActions) {
    /** Represents a message with no action set. */
    ChatMessageActions["MessageUnset"] = "message.unset";
    /** Action applied to a new message. */
    ChatMessageActions["MessageCreate"] = "message.create";
    /** Action applied to an updated message. */
    ChatMessageActions["MessageUpdate"] = "message.update";
    /** Action applied to a deleted message. */
    ChatMessageActions["MessageDelete"] = "message.delete";
    /** Action applied to a new annotation. */
    ChatMessageActions["MessageAnnotationCreate"] = "annotation.create";
    /** Action applied to a deleted annotation. */
    ChatMessageActions["MessageAnnotationDelete"] = "annotation.delete";
    /** Action applied to a meta occupancy message. */
    ChatMessageActions["MessageMetaOccupancy"] = "meta.occupancy";
})(ChatMessageActions || (ChatMessageActions = {}));
/**
 * Enum representing presence events.
 */
export var PresenceEvents;
(function (PresenceEvents) {
    /**
     * Event triggered when a user enters.
     */
    PresenceEvents["Enter"] = "enter";
    /**
     * Event triggered when a user leaves.
     */
    PresenceEvents["Leave"] = "leave";
    /**
     * Event triggered when a user updates their presence data.
     */
    PresenceEvents["Update"] = "update";
    /**
     * Event triggered when a user initially subscribes to presence.
     */
    PresenceEvents["Present"] = "present";
})(PresenceEvents || (PresenceEvents = {}));
export var TypingEvents;
(function (TypingEvents) {
    /** The set of currently typing users has changed. */
    TypingEvents["Changed"] = "typing.changed";
})(TypingEvents || (TypingEvents = {}));
/**
 * Room reaction events. This is used for the realtime system since room reactions
 * have only one event: "roomReaction".
 */
export var RoomReactionEvents;
(function (RoomReactionEvents) {
    /**
     * Event triggered when a room reaction was received.
     */
    RoomReactionEvents["Reaction"] = "roomReaction";
})(RoomReactionEvents || (RoomReactionEvents = {}));
//# sourceMappingURL=events.js.map