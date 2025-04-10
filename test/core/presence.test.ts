import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { DefaultPresence, PresenceData, PresenceEvent } from '../../src/core/presence.ts';
import { Room } from '../../src/core/room.ts';
import { PresenceEvents, RoomOptions } from '../../src/index.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  room: Room;
  makeRoom: (options?: RoomOptions) => Room;
  currentChannelOptions: Ably.ChannelOptions;
}

vi.mock('ably');

describe('Presence', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.makeRoom = (options) => makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime, options });
    context.room = context.makeRoom();
  });

  describe<TestContext>('subscribe', () => {
    it<TestContext>('throws ErrorInfo if subscribing with no arguments', (context) => {
      expect(() => {
        context.room.presence.subscribe();
      }).toThrowErrorInfo({
        message: 'could not subscribe listener: invalid arguments',
        code: 40000,
      });
    });

    it<TestContext>('throws ErrorInfo if presence events are not enabled', (context) => {
      const room = context.makeRoom({ presence: { enablePresenceEvents: false } });

      expect(() => {
        room.presence.subscribe(() => {});
      }).toThrowErrorInfo({
        message: 'could not subscribe to presence; presence events are not enabled',
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
  });

  describe<TestContext>('room configuration', () => {
    it<TestContext>('removes the presence channel mode if room option disabled', (context) => {
      vi.spyOn(context.realtime.channels, 'get');
      const room = context.makeRoom({ presence: { enablePresenceEvents: false } });

      // Check the channel was called as planned
      expect(context.realtime.channels.get).toHaveBeenCalledOnce();
      expect(context.realtime.channels.get).toHaveBeenCalledWith(
        room.channel.name,
        expect.objectContaining({
          modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE'],
        }),
      );
    });
  });

  it<TestContext>('does not remove mode if option enabled', (context) => {
    vi.spyOn(context.realtime.channels, 'get');
    const room = context.makeRoom({ presence: { enablePresenceEvents: true } });

    // Check the channel was called as planned
    expect(context.realtime.channels.get).toHaveBeenCalledOnce();
    expect(context.realtime.channels.get).toHaveBeenCalledWith(
      room.channel.name,
      expect.not.objectContaining({
        modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE'],
      }),
    );
  });
});
