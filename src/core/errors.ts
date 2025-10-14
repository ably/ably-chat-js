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
   * Invalid argument provided.
   */
  InvalidArgument = 40003,

  /**
   * Invalid client ID.
   */
  InvalidClientId = 40012,

  /**
   * Resource has been disposed.
   */
  ResourceDisposed = 40014,

  /**
   * The message was rejected before publishing by a rule on the chat room.
   */
  MessageRejectedByBeforePublishRule = 42211,

  /**
   * The message was rejected before publishing by a moderation rule on the chat room.
   */
  MessageRejectedByModeration = 42213,

  /**
   * The client is not connected to Ably.
   */
  Disconnected = 80003,

  /**
   * Could not re-enter presence automatically after a room re-attach occurred.
   */
  PresenceAutoReentryFailed = 91004,

  /**
   * The room has experienced a discontinuity.
   */
  RoomDiscontinuity = 102100,

  // Unable to perform operation;

  /**
   * Cannot perform operation because the room is in an invalid state.
   */
  RoomInInvalidState = 102112,

  /**
   * Room was released before the operation could complete.
   */
  RoomReleasedBeforeOperationCompleted = 102106,

  /**
   * A room already exists with different options.
   */
  RoomExistsWithDifferentOptions = 102107,

  /**
   * Feature is not enabled in room options.
   */
  FeatureNotEnabledInRoom = 102108,

  /**
   * Listener has not been subscribed yet.
   */
  ListenerNotSubscribed = 102109,

  /**
   * Channel serial is not defined when expected.
   */
  ChannelSerialNotDefined = 102110,

  /**
   * Channel options cannot be modified after the channel has been requested.
   */
  ChannelOptionsCannotBeModified = 102111,

  /**
   * Failed to enforce sequential execution of the operation.
   */
  OperationSerializationFailed = 102113,

  // 102200 - 102300 are reserved for React errors

  /**
   * React hook must be used within the appropriate provider.
   */
  ReactHookMustBeUsedWithinProvider = 102200,

  /**
   * React component has been unmounted.
   */
  ReactComponentUnmounted = 102201,

  /**
   * Failed to fetch presence data after maximum retries.
   */
  PresenceFetchFailed = 102202,
}

/**
 * Returns true if the {@link Ably.ErrorInfo} code matches the provided ErrorCode value.
 * @param errorInfo The error info to check.
 * @param error The error code to compare against.
 * @returns true if the error code matches, false otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
export const errorInfoIs = (errorInfo: Ably.ErrorInfo, error: ErrorCode): boolean => errorInfo.code === error;
