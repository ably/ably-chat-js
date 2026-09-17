import * as Ably from '@ably/pubsub-core';

/**
 * Handler for discontinuity events
 * @param error - The error that occurred to cause the discontinuity.
 */
export type DiscontinuityListener = (error: Ably.ErrorInfo) => void;
