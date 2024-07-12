import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { PresenceEvents } from '../../src/core/events.ts';
import {
  addListenerToChannelPresenceWithoutAttach,
  addListenerToChannelWithoutAttach,
} from '../../src/core/realtime-extensions.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';

interface TestContext {
  realtime: Ably.Realtime;
  channel: Ably.RealtimeChannel;
}

describe('realtime extensions', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    context.channel = context.realtime.channels.get(randomRoomId());
  });

  it<TestContext>('adds a listener for channel messages without attaching the channel', (context) =>
    new Promise<void>((done) => {
      const { channel } = context;
      const listener = (message: Ably.InboundMessage) => {
        expect(message.name).toEqual('test');
        done();
      };

      addListenerToChannelWithoutAttach({ channel, listener, events: ['test'] });

      // Check the channel is still in initialized state
      expect(channel.state).toEqual('initialized');

      void channel.attach().then(() => void channel.publish('test', 'test'));
    }));

  it<TestContext>('adds a listener for channel messages without attaching the channel and no events', (context) =>
    new Promise<void>((done) => {
      const { channel } = context;
      const listener = (message: Ably.InboundMessage) => {
        expect(message.name).toEqual('test');
        done();
      };

      addListenerToChannelWithoutAttach({ channel, listener });

      // Check the channel is still in initialized state
      expect(channel.state).toEqual('initialized');

      void channel.attach().then(() => void channel.publish('test', 'test'));
    }));

  it<TestContext>(
    'respects listener events for channel messages',
    { timeout: 10000 },
    (context) =>
      new Promise<void>((done, reject) => {
        const { channel } = context;
        const listener = () => {
          reject(new Error('Listener should not be called'));
        };

        addListenerToChannelWithoutAttach({ channel, listener, events: ['test'] });

        // Check the channel is still in initialized state
        expect(channel.state).toEqual('initialized');

        // Send a message
        void channel.attach().then(() => void channel.publish('test2', 'test'));

        // Wait for 3 seconds to ensure the listener is not called
        setTimeout(done, 3000);
      }),
  );

  it<TestContext>('adds a listener for presence messages without attaching the channel', (context) =>
    new Promise<void>((done) => {
      const { channel } = context;
      const listener = (message: Ably.PresenceMessage) => {
        expect(message.data).toEqual('foo-data');
        done();
      };

      addListenerToChannelPresenceWithoutAttach({
        channel,
        listener,
        events: [PresenceEvents.Enter, PresenceEvents.Present],
      });

      // Check the channel is still in initialized state
      expect(channel.state).toEqual('initialized');

      // Add another client to the channel
      const otherRealtime = ablyRealtimeClient();
      void otherRealtime.channels
        .get(channel.name)
        .attach()
        .then(() => void channel.presence.enter('foo-data'));

      // Attach our channel
      void channel.attach();
    }));

  it<TestContext>('adds a listener for presence messages without attaching the channel and no events', (context) =>
    new Promise<void>((done) => {
      const { channel } = context;
      const listener = (message: Ably.PresenceMessage) => {
        expect(message.data).toEqual('foo-data');
        done();
      };

      addListenerToChannelPresenceWithoutAttach({ channel, listener });

      // Check the channel is still in initialized state
      expect(channel.state).toEqual('initialized');

      // Add another client to the channel
      const otherRealtime = ablyRealtimeClient();
      void otherRealtime.channels
        .get(channel.name)
        .attach()
        .then(() => void channel.presence.enter('foo-data'));

      // Attach our channel
      void channel.attach();
    }));

  it<TestContext>(
    'respects listener events for presence messages',
    { timeout: 10000 },
    (context) =>
      new Promise<void>((done, reject) => {
        const { channel } = context;
        const listener = () => {
          reject(new Error('Listener should not be called'));
        };

        addListenerToChannelPresenceWithoutAttach({ channel, listener, events: [PresenceEvents.Leave] });

        // Check the channel is still in initialized state
        expect(channel.state).toEqual('initialized');

        // Add another client to the channel
        const otherRealtime = ablyRealtimeClient();
        void otherRealtime.channels
          .get(channel.name)
          .attach()
          .then(() => void channel.presence.enter('foo-data'));

        // Attach our channel
        void channel.attach();

        // Wait for 3 seconds to ensure the listener is not called
        setTimeout(done, 3000);
      }),
  );
});
