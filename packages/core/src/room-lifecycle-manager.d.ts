import * as Ably from 'ably';
import { HandlesDiscontinuity } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
/**
 * An interface for features that contribute to the room status.
 */
export interface ContributesToRoomLifecycle extends HandlesDiscontinuity {
    /**
     * Gets the channel on which the feature operates.
     */
    get channel(): Ably.RealtimeChannel;
    /**
     * Gets the ErrorInfo code that should be used when the feature fails to attach.
     * @returns The error that should be used when the feature fails to attach.
     */
    get attachmentErrorCode(): ErrorCodes;
    /**
     * Gets the ErrorInfo code that should be used when the feature fails to detach.
     * @returns The error that should be used when the feature fails to detach.
     */
    get detachmentErrorCode(): ErrorCodes;
}
