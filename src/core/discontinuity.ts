import * as Ably from 'ably';

/**
 * Handler for discontinuity events
 */
export type DiscontinuityListener = (error: Ably.ErrorInfo) => void;
