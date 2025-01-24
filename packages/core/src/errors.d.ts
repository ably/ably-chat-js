import * as Ably from 'ably';
/**
 * Error codes for the Chat SDK.
 */
export declare enum ErrorCodes {
    /**
     * The message was rejected before publishing by a rule on the chat room.
     */
    MessageRejectedByBeforePublishRule = 42211,
    /**
     * The message was rejected before publishing by a moderation rule on the chat room.
     */
    MessageRejectedByModeration = 42213,
    /**
     * The messages feature failed to attach.
     */
    MessagesAttachmentFailed = 102001,
    /**
     * The presence feature failed to attach.
     */
    PresenceAttachmentFailed = 102002,
    /**
     * The reactions feature failed to attach.
     */
    ReactionsAttachmentFailed = 102003,
    /**
     * The occupancy feature failed to attach.
     */
    OccupancyAttachmentFailed = 102004,
    /**
     * The typing feature failed to attach.
     */
    TypingAttachmentFailed = 102005,
    /**
     * The messages feature failed to detach.
     */
    MessagesDetachmentFailed = 102050,
    /**
     * The presence feature failed to detach.
     */
    PresenceDetachmentFailed = 102051,
    /**
     * The reactions feature failed to detach.
     */
    ReactionsDetachmentFailed = 102052,
    /**
     * The occupancy feature failed to detach.
     */
    OccupancyDetachmentFailed = 102053,
    /**
     * The typing feature failed to detach.
     */
    TypingDetachmentFailed = 102054,
    /**
     * The room has experienced a discontinuity.
     */
    RoomDiscontinuity = 102100,
    /**
     * Cannot perform operation because the room is in a failed state.
     */
    RoomInFailedState = 102101,
    /**
     * Cannot perform operation because the room is in a releasing state.
     */
    RoomIsReleasing = 102102,
    /**
     * Cannot perform operation because the room is in a released state.
     */
    RoomIsReleased = 102103,
    /**
     * Cannot perform operation because the previous operation failed.
     */
    PreviousOperationFailed = 102104,
    /**
     * An unknown error has happened in the room lifecycle.
     */
    RoomLifecycleError = 102105,
    /**
     * Room was released before the operation could complete.
     */
    RoomReleasedBeforeOperationCompleted = 102106
}
/**
 * Returns true if the {@link Ably.ErrorInfo} code matches the provided ErrorCodes value.
 *
 * @param errorInfo The error info to check.
 * @param error The error code to compare against.
 * @returns true if the error code matches, false otherwise.
 */
export declare const errorInfoIs: (errorInfo: Ably.ErrorInfo, error: ErrorCodes) => boolean;
