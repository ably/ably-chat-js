import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultRoomLifecycle, RoomStatus } from '../../src/core/room-status.ts';
import { makeTestLogger } from '../helper/logger.ts';

const baseError = new Ably.ErrorInfo('error', 500, 50000);

describe('room status', () => {
  it('defaults to initialized', () => {
    const status = new DefaultRoomLifecycle('roomId', makeTestLogger());
    expect(status.status).toEqual(RoomStatus.Initialized);
    expect(status.error).toBeUndefined();
  });

  it('listeners can be added', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultRoomLifecycle('roomId', makeTestLogger());
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
      const status = new DefaultRoomLifecycle('roomId', makeTestLogger());
      const { off } = status.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      off();
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      done();
    }));

  it('subscriptions are unique even if listeners are identical', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultRoomLifecycle('roomId', makeTestLogger());

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
});
