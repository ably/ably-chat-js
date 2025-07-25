import * as Ably from 'ably';

/**
 * Handler for discontinuity events
 * @param error - The error that occurred to cause the discontinuity.
 */
export type DiscontinuityListener = (error: Ably.ErrorInfo) => void;
