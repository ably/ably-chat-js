/**
 * Represents a subscription that can be unsubscribed from.
 * This interface provides a way to clean up and remove subscriptions when they
 * are no longer needed.
 * @example
 * ```typescript
 * const s = someService.subscribe();
 * // Later when done with the subscription
 * s.unsubscribe();
 * ```
 */
export interface Subscription {
  /**
   * This method should be called when the subscription is no longer needed,
   * it will make sure no further events will be sent to the subscriber and
   * that references to the subscriber are cleaned up.
   */
  readonly unsubscribe: () => void;
}

/**
 * Represents a subscription to status change events that can be unsubscribed from. This
 * interface provides a way to clean up and remove subscriptions when they are no longer needed.
 * @example
 * ```typescript
 * const s = someService.onStatusChange();
 * const s2 = someOtherService.on()
 * // Later when done with the subscription
 * s.off();
 * s2.off();
 * ```
 */
export interface StatusSubscription {
  /**
   * Unsubscribes from the status change events. It will ensure that no
   * further status change events will be sent to the subscriber and
   * that references to the subscriber are cleaned up.
   */
  readonly off: () => void;
}
