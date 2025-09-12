import { expect, vi } from 'vitest';

import { Onable, Subscribable } from '../../src/core/realtime-subscriptions.ts';

/**
 * Wait for the unsubscribe method to be called with the given callback.
 * @param subscribable The subscribable object to wait for.
 * @param callback The callback to wait for.
 * @returns A promise that resolves when the unsubscribe method is called with the given callback.
 */
export const waitForUnsubscribe = (subscribable: Subscribable<unknown>, callback: unknown): Promise<void> =>
  vi.waitFor(() => {
    expect(subscribable.unsubscribe).toHaveBeenCalledWith(callback);
  });

/**
 * Wait for the unsubscribe method to be called the given number of times.
 * @param subscribable The subscribable object to wait for.
 * @param times The number of times to wait for.
 * @returns A promise that resolves when the unsubscribe method is called the given number of times.
 */
export const waitForUnsubscribeTimes = (subscribable: Subscribable<unknown>, times: number): Promise<void> =>
  vi.waitFor(() => {
    expect(subscribable.unsubscribe).toHaveBeenCalledTimes(times);
  });

/**
 * Wait for the off method to be called with the given callback.
 * @param onable The onable object to wait for.
 * @param callback The callback to wait for.
 * @returns A promise that resolves when the off method is called with the given callback.
 */
export const waitForOff = (onable: Onable<unknown>, callback: unknown): Promise<void> =>
  vi.waitFor(() => {
    expect(onable.off).toHaveBeenCalledWith(callback);
  });

/**
 * Wait for the off method to be called the given number of times.
 * @param onable The onable object to wait for.
 * @param times The number of times to wait for.
 * @returns A promise that resolves when the off method is called the given number of times.
 */
export const waitForOffTimes = (onable: Onable<unknown>, times: number): Promise<void> =>
  vi.waitFor(() => {
    expect(onable.off).toHaveBeenCalledTimes(times);
  });
