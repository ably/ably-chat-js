import { expect, vi } from 'vitest';

import { Subscribable } from '../../src/core/realtime-subscriptions.ts';

/**
 * Wait for the unsubscribe method to be called with the given callback.
 * @param subscribable The subscribable object to wait for.
 * @param callback The callback to wait for.
 * @returns A promise that resolves when the unsubscribe method is called with the given callback.
 */
export const waitForUnsubscribe = (subscribable: Subscribable<unknown>, callback: unknown): Promise<void> => {
  return vi.waitFor(() => {
    expect(subscribable.unsubscribe).toHaveBeenCalledWith(callback);
  });
};

/**
 * Wait for the unsubscribe method to be called the given number of times.
 * @param subscribable The subscribable object to wait for.
 * @param times The number of times to wait for.
 * @returns A promise that resolves when the unsubscribe method is called the given number of times.
 */
export const waitForUnsubscribeTimes = (subscribable: Subscribable<unknown>, times: number): Promise<void> => {
  return vi.waitFor(() => {
    expect(subscribable.unsubscribe).toHaveBeenCalledTimes(times);
  });
};
