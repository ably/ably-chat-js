import * as Ably from 'ably';

/**
 * Error codes for the Chat SDK.
 */
export enum ErrorCode {
  /**
   * The request was invalid.
   */
  BadRequest = 40000,

  /**
   * The message was rejected before publishing by a rule on the chat room.
   */
  MessageRejectedByBeforePublishRule = 42211,

  /**
   * The message was rejected before publishing by a moderation rule on the chat room.
   */
  MessageRejectedByModeration = 42213,

  /**
   * The room has experienced a discontinuity.
   */
  RoomDiscontinuity = 102100,

  // Unable to perform operation;

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
   * Room was released before the operation could complete.
   */
  RoomReleasedBeforeOperationCompleted = 102106,
}

/**
 * Returns true if the {@link Ably.ErrorInfo} code matches the provided ErrorCode value.
 *
 * @param errorInfo The error info to check.
 * @param error The error code to compare against.
 * @returns true if the error code matches, false otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
export const errorInfoIs = (errorInfo: Ably.ErrorInfo, error: ErrorCode): boolean => errorInfo.code === error;
