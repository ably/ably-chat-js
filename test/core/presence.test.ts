import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { DefaultPresence, PresenceData, PresenceEvent } from '../../src/core/presence.ts';
import { Room } from '../../src/core/room.ts';
import { PresenceEvents } from '../../src/index.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  room: Room;
  currentChannelOptions: Ably.ChannelOptions;
}

vi.mock('ably');

describe('Presence', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
  });

  it<TestContext>('has an attachment error code', (context) => {
    expect((context.room.presence as DefaultPresence).attachmentErrorCode).toBe(102002);
  });

  it<TestContext>('has a detachment error code', (context) => {
    expect((context.room.presence as DefaultPresence).detachmentErrorCode).toBe(102051);
  });

  it<TestContext>('throws ErrorInfo if subscribing with no arguments', (context) => {
    expect(() => {
      context.room.presence.subscribe();
    }).toThrowErrorInfo({
      message: 'could not subscribe listener: invalid arguments',
      code: 40000,
    });
  });

  it<TestContext>('should only unsubscribe the correct subscription', (context) => {
    const { room } = context;
    const received: PresenceEvent[] = [];

    const emulatePresenceEvent = (clientId: string, action: PresenceEvents, data?: PresenceData) => {
      const presenceMessage: Ably.PresenceMessage = {
        action,
        clientId,
        timestamp: Date.now(),
        data: data ? { userCustomData: data } : undefined,
        connectionId: 'connection-id',
        encoding: '',
        id: 'message-id',
        extras: null,
      };

      // Call the subscribeToEvents handler directly
      (room.presence as DefaultPresence).subscribeToEvents(presenceMessage);
    };

    const listener = (event: PresenceEvent) => {
      received.push(event);
    };

    // Subscribe the same listener twice
    const subscription1 = room.presence.subscribe(listener);
    const subscription2 = room.presence.subscribe(listener);

    // Both subscriptions should trigger the listener
    emulatePresenceEvent('user1', PresenceEvents.Enter, { foo: 'bar' });
    expect(received).toHaveLength(2);

    // Unsubscribe first subscription
    subscription1.unsubscribe();

    // One subscription should still trigger the listener
    emulatePresenceEvent('user2', PresenceEvents.Enter, { baz: 'qux' });
    expect(received).toHaveLength(3);

    // Unsubscribe second subscription
    subscription2.unsubscribe();

    // No subscriptions should trigger the listener
    emulatePresenceEvent('user3', PresenceEvents.Enter, { test: 'data' });
    expect(received).toHaveLength(3);
  });

  it<TestContext>('should only unsubscribe the correct subscription for discontinuities', (context) => {
    const { room } = context;

    const received: string[] = [];
    const listener = (error?: Ably.ErrorInfo) => {
      received.push(error?.message ?? 'no error');
    };

    const subscription1 = room.presence.onDiscontinuity(listener);
    const subscription2 = room.presence.onDiscontinuity(listener);

    (room.presence as DefaultPresence).discontinuityDetected(new Ably.ErrorInfo('error1', 0, 0));
    expect(received).toEqual(['error1', 'error1']);

    subscription1.off();
    (room.presence as DefaultPresence).discontinuityDetected(new Ably.ErrorInfo('error2', 0, 0));
    expect(received).toEqual(['error1', 'error1', 'error2']);

    subscription2.off();
    (room.presence as DefaultPresence).discontinuityDetected(new Ably.ErrorInfo('error3', 0, 0));
    expect(received).toEqual(['error1', 'error1', 'error2']);
  });
});
