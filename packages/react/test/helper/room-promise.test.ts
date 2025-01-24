import { describe, expect, it, vi } from 'vitest';

import { makeTestLogger } from '../../../shared/testhelper/logger.ts';
import { Room } from '../../../core/src/room.ts';
import { wrapRoomPromise } from '../../src/helper/room-promise.ts';
import { makeRandomRoom } from '../../shared/testhelper/room.ts';

describe('room-promise', () => {
  it('should mount and unmount with promise resolution', async () => {
    let shouldResolve = false;
    let hasResolved = false;
    const roomPromise = new Promise<Room>((resolve) => {
      const interval = setInterval(() => {
        if (shouldResolve) {
          clearInterval(interval);
          resolve(makeRandomRoom({}));
        }
      }, 150);
    });

    // Wrap the promise
    let hasUnmounted = false;
    const wrapped = wrapRoomPromise(
      roomPromise,
      (room) => {
        hasResolved = true;
        expect(room).toBeDefined();

        return () => {
          hasUnmounted = true;
        };
      },
      makeTestLogger(),
      'test-room',
    );

    // Now say the promise should resolve
    shouldResolve = true;
    await vi.waitFor(() => {
      expect(hasResolved).toBe(true);
    });

    // Now call unmount
    wrapped.unmount()();

    expect(hasUnmounted).toBe(true);
  });

  it('should mount and unmount before promise resolution', async () => {
    let shouldResolve = false;
    const roomPromise = new Promise<Room>((resolve) => {
      const interval = setInterval(() => {
        if (shouldResolve) {
          clearInterval(interval);
          resolve(makeRandomRoom({}));
        }
      }, 150);
    });

    // Wrap the promise
    const wrapped = wrapRoomPromise(
      roomPromise,
      () => {
        // Should never be called
        expect(true).toBe(false);

        return () => {
          expect(true).toBe(false);
        };
      },
      makeTestLogger(),
      'test-room',
    );

    // Now call unmount
    wrapped.unmount()();

    // Now say the promise should resolve
    shouldResolve = true;

    // Wait for 5 intervals of 150ms to confirm the callback was never called
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // Calling unmount again should be a noop
    wrapped.unmount()();

    // Wait for another set of intervals to confirm the callback was never called
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  });
});
