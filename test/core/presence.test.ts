import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { Room } from '../../src/core/room.ts';
import { RoomOptions } from '../../src/index.ts';
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

  it<TestContext>('throws ErrorInfo if subscribing with no arguments', (context) => {
    expect(() => {
      context.room.presence.subscribe();
    }).toThrowErrorInfo({
      message: 'could not subscribe listener: invalid arguments',
      code: 40000,
    });
  });

  describe<TestContext>('room configuration', () => {
    it<TestContext>('removes the presence channel mode if room option disabled', (context) => {
      vi.spyOn(context.realtime.channels, 'get');
      const room = context.makeRoom({ presence: { receivePresenceEvents: false } });

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
    const room = context.makeRoom({ presence: { receivePresenceEvents: true } });

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
