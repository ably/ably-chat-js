import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultStatus, RoomStatus } from '../src/RoomStatus.ts';
import { makeTestLogger } from './helper/logger.ts';

const baseError = new Ably.ErrorInfo('error', 500, 50000);

describe('room status', () => {
  it('defaults to initialized', () => {
    const status = new DefaultStatus(makeTestLogger());
    expect(status.currentStatus).toEqual(RoomStatus.Initialized);
    expect(status.error).toBeUndefined();
  });

  it('listeners can be added', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultStatus(makeTestLogger());
      status.onChange((status) => {
        expect(status.status).toEqual(RoomStatus.Attached);
        expect(status.error).toEqual(baseError);
        done();
      });

      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      reject(new Error('Expected onChange to be called'));
    }));

  it('listeners can be removed', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultStatus(makeTestLogger());
      const { off } = status.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      off();
      status.setStatus({ status: RoomStatus.Attached, error: baseError });
      done();
    }));

  it('listeners can all be removed', () =>
    new Promise<void>((done, reject) => {
      const status = new DefaultStatus(makeTestLogger());
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
