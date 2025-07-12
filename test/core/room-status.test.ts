import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { DefaultRoomLifecycle, RoomStatus } from '../../src/core/room-status.ts';
import { makeTestLogger } from '../helper/logger.ts';

const baseError = new Ably.ErrorInfo('error', 500, 50000);

describe('room status', () => {
  it('defaults to initialized', () => {
    const status = new DefaultRoomLifecycle(makeTestLogger());
    expect(status.status).toEqual(RoomStatus.Initialized);
    expect(status.error).toBeUndefined();
  });

  it('listeners can be added', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultRoomLifecycle(makeTestLogger());
      status.onChange((status) => {
        expect(status.current).toEqual(RoomStatus.Attached);
        expect(status.error).toEqual(baseError);
        done();
      });

      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      reject(new Error('Expected onChange to be called'));
    }));

  it('listeners can be removed', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultRoomLifecycle(makeTestLogger());
      const { off } = status.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      off();
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      done();
    }));

  it('subscriptions are unique even if listeners are identical', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultRoomLifecycle(makeTestLogger());

      let eventCount = 0;
      const listener = () => {
        eventCount++;
        if (eventCount > 3) {
          reject(new Error('too many events received (' + eventCount.toString() + ')'));
        }
      };

      const s1 = status.onChange(listener);
      const s2 = status.onChange(listener);
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      expect(eventCount).toEqual(2);
      s1.off();
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      expect(eventCount).toEqual(3);
      s2.off();
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      expect(eventCount).toEqual(3);
      done();
    }));

  describe('dispose', () => {
    it('should dispose and remove all listeners', () => {
      const status = new DefaultRoomLifecycle(makeTestLogger());

      // Add some listeners
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      status.onChange(listener1);
      status.onChange(listener2);

      // Verify listeners work before dispose
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Act - dispose
      const statusWithHasListeners = status as unknown as { dispose(): void; hasListeners(): boolean };
      statusWithHasListeners.dispose();

      // Assert - verify listeners no longer work after dispose
      listener1.mockClear();
      listener2.mockClear();

      status.setStatus({ status: RoomStatus.Detached });
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();

      // Verify that user-provided listeners were unsubscribed
      expect(statusWithHasListeners.hasListeners()).toBe(false);
    });

    it('should not fail when disposing multiple times', () => {
      const status = new DefaultRoomLifecycle(makeTestLogger());

      // Act & Assert - should not throw
      expect(() => {
        (status as unknown as { dispose(): void }).dispose();
        (status as unknown as { dispose(): void }).dispose();
        (status as unknown as { dispose(): void }).dispose();
      }).not.toThrow();
    });
  });
});
