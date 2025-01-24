import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { makeTestLogger } from '../../shared/testhelper/logger.ts';
import { DefaultRoomLifecycle, RoomStatus } from '../src/room-status.ts';

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

  it('listeners can all be removed', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultRoomLifecycle('roomId', makeTestLogger());
      status.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      status.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      status.offAll();
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      done();
    }));
});
