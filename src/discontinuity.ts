import * as Ably from 'ably';

import EventEmitter from './utils/EventEmitter.js';

/**
 * Represents an object that has a channel and therefore may care about discontinuities.
 */
export interface HandlesDiscontinuity {
  /**
   * The channel that this object is associated with.
   */
  get channel(): Ably.RealtimeChannel;

  /**
   * Called when a discontinuity is detected on the channel.
   * @param reason The error that caused the discontinuity.
   */
  discontinuityDetected(reason?: Ably.ErrorInfo): void;
}

/**
 * A response to subscribing to discontinuity events that allows control of the subscription.
 */
export interface OnDiscontinuitySubscriptionResponse {
  /**
   * Unsubscribe from discontinuity events.
   */
  off(): void;
}

/**
 * A listener that can be registered for discontinuity events.
 * @param reason The error that caused the discontinuity.
 */
export type DiscontinuityListener = (reason?: Ably.ErrorInfo) => void;

/**
 * An interface to be implemented by objects that can emit discontinuities to listeners.
 */
export interface EmitsDiscontinuities {
  /**
   * Register a listener to be called when a discontinuity is detected.
   * @param listener The listener to be called when a discontinuity is detected.
   * @returns A response that allows control of the subscription.
   */
  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse;
}

interface DiscontinuityEventMap {
  ['discontinuity']: Ably.ErrorInfo | undefined;
}

/**
 * An event emitter specialization for discontinuity events.
 */
export type DiscontinuityEmitter = EventEmitter<DiscontinuityEventMap>;

/**
 * Creates a new discontinuity emitter.
 * @returns A new discontinuity emitter.
 */
export const newDiscontinuityEmitter = (): DiscontinuityEmitter => new EventEmitter();
