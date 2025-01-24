/**
 * Error codes for the Chat SDK.
 */
export var ErrorCodes;
(function (ErrorCodes) {
    /**
     * The message was rejected before publishing by a rule on the chat room.
     */
    ErrorCodes[ErrorCodes["MessageRejectedByBeforePublishRule"] = 42211] = "MessageRejectedByBeforePublishRule";
    /**
     * The message was rejected before publishing by a moderation rule on the chat room.
     */
    ErrorCodes[ErrorCodes["MessageRejectedByModeration"] = 42213] = "MessageRejectedByModeration";
    /**
     * The messages feature failed to attach.
     */
    ErrorCodes[ErrorCodes["MessagesAttachmentFailed"] = 102001] = "MessagesAttachmentFailed";
    /**
     * The presence feature failed to attach.
     */
    ErrorCodes[ErrorCodes["PresenceAttachmentFailed"] = 102002] = "PresenceAttachmentFailed";
    /**
     * The reactions feature failed to attach.
     */
    ErrorCodes[ErrorCodes["ReactionsAttachmentFailed"] = 102003] = "ReactionsAttachmentFailed";
    /**
     * The occupancy feature failed to attach.
     */
    ErrorCodes[ErrorCodes["OccupancyAttachmentFailed"] = 102004] = "OccupancyAttachmentFailed";
    /**
     * The typing feature failed to attach.
     */
    ErrorCodes[ErrorCodes["TypingAttachmentFailed"] = 102005] = "TypingAttachmentFailed";
    // 102006 - 102049 reserved for future use for attachment errors
    /**
     * The messages feature failed to detach.
     */
    ErrorCodes[ErrorCodes["MessagesDetachmentFailed"] = 102050] = "MessagesDetachmentFailed";
    /**
     * The presence feature failed to detach.
     */
    ErrorCodes[ErrorCodes["PresenceDetachmentFailed"] = 102051] = "PresenceDetachmentFailed";
    /**
     * The reactions feature failed to detach.
     */
    ErrorCodes[ErrorCodes["ReactionsDetachmentFailed"] = 102052] = "ReactionsDetachmentFailed";
    /**
     * The occupancy feature failed to detach.
     */
    ErrorCodes[ErrorCodes["OccupancyDetachmentFailed"] = 102053] = "OccupancyDetachmentFailed";
    /**
     * The typing feature failed to detach.
     */
    ErrorCodes[ErrorCodes["TypingDetachmentFailed"] = 102054] = "TypingDetachmentFailed";
    // 102055 - 102099 reserved for future use for detachment errors
    /**
     * The room has experienced a discontinuity.
     */
    ErrorCodes[ErrorCodes["RoomDiscontinuity"] = 102100] = "RoomDiscontinuity";
    // Unable to perform operation;
    /**
     * Cannot perform operation because the room is in a failed state.
     */
    ErrorCodes[ErrorCodes["RoomInFailedState"] = 102101] = "RoomInFailedState";
    /**
     * Cannot perform operation because the room is in a releasing state.
     */
    ErrorCodes[ErrorCodes["RoomIsReleasing"] = 102102] = "RoomIsReleasing";
    /**
     * Cannot perform operation because the room is in a released state.
     */
    ErrorCodes[ErrorCodes["RoomIsReleased"] = 102103] = "RoomIsReleased";
    /**
     * Cannot perform operation because the previous operation failed.
     */
    ErrorCodes[ErrorCodes["PreviousOperationFailed"] = 102104] = "PreviousOperationFailed";
    /**
     * An unknown error has happened in the room lifecycle.
     */
    ErrorCodes[ErrorCodes["RoomLifecycleError"] = 102105] = "RoomLifecycleError";
    /**
     * Room was released before the operation could complete.
     */
    ErrorCodes[ErrorCodes["RoomReleasedBeforeOperationCompleted"] = 102106] = "RoomReleasedBeforeOperationCompleted";
})(ErrorCodes || (ErrorCodes = {}));
/**
 * Returns true if the {@link Ably.ErrorInfo} code matches the provided ErrorCodes value.
 *
 * @param errorInfo The error info to check.
 * @param error The error code to compare against.
 * @returns true if the error code matches, false otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
export const errorInfoIs = (errorInfo, error) => errorInfo.code === error;
//# sourceMappingURL=errors.js.map