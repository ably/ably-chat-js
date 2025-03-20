import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { ChatApi } from '../../src/core/chat-api.ts';
import { TypingEvent, TypingEvents } from '../../src/core/events.ts';
import { Logger } from '../../src/core/logger.ts';
import { Room } from '../../src/core/room.ts';
import { RoomOptions } from '../../src/core/room-options.ts';
import { DefaultTyping, Typing } from '../../src/core/typing.ts';
import { channelEventEmitter, ChannelEventEmitterReturnType } from '../helper/channel.ts';
import { waitForArrayLength } from '../helper/common.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chat: ChatClient;
  chatApi: ChatApi;
  room: Room;
  emulateBackendPublish: ChannelEventEmitterReturnType<Partial<Ably.InboundMessage>>;
  options: RoomOptions;
  logger: Logger;
}

const TEST_HEARTBEAT_THROTTLE_MS = 200;

const startMessage: Ably.Message = {
  name: TypingEvents.Start,
  extras: {
    ephemeral: true,
  },
};

const stopMessage: Ably.Message = {
  name: TypingEvents.Stop,
  extras: {
    ephemeral: true,
  },
};

// This interface simply extends the DefaultTyping interface and exposes some private properties for testing
interface TestTypingInterface extends Typing {
  _heartbeatTimerId: ReturnType<typeof setTimeout> | undefined;
  _currentlyTyping: Map<string, ReturnType<typeof setTimeout>>;
}

vi.mock('ably');

describe('Typing', () => {
  beforeEach<TestContext>((context) => {
    context.logger = makeTestLogger();
    context.options = {
      typing: {
        heartbeatThrottleMs: TEST_HEARTBEAT_THROTTLE_MS,
      },
    };
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, context.logger);
    context.room = makeRandomRoom(context);
    const channel = context.room.typing.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);
  });

  // CHA-T8
  it<TestContext>('uses the correct realtime channel', (context) => {
    expect(context.room.typing.channel.name).toBe(`${context.room.roomId}::$chat`);
  });

  // CHA-T9
  it<TestContext>('gets current typers', (context) => {
    const { room } = context;

    // Emulate a typing event
    context.emulateBackendPublish({
      name: TypingEvents.Start,
      clientId: 'some',
    });

    // Ensure that the typing status is correct
    expect(room.typing.get()).toEqual(new Set(['some']));
  });

  it<TestContext>('ensures multiple start/stop calls are resolved in order', async (context) => {
    const { room, realtime } = context;
    const channel = room.typing.channel;
    const realtimeChannel = realtime.channels.get(channel.name);

    // Mock implementation for `publish` to simulate delay in the call on the first invocation
    const publishSpy = vi
      .spyOn(realtimeChannel, 'publish')
      .mockImplementationOnce(() => {
        return new Promise((resolve) => setTimeout(resolve, 300)); // Simulate 300ms delay in publish
      })
      .mockImplementationOnce(() => Promise.resolve());

    // Needed to allow typing calls to proceed
    vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('attached');

    // To track resolution order
    const resolveOrder: string[] = [];

    // Start the first typing operation
    const startPromise1 = new Promise<void>((resolve, reject) => {
      room.typing
        .keystroke()
        .then(() => {
          resolveOrder.push('startPromise');
          resolve();
        })
        .catch(reject);
    });

    // Start the second operation with a short delay of 100ms,
    // this is smaller than the delay in the mock publish of 300ms.
    // The `stop` call should await before the `start` call has resolved, but only resolve itself after.
    const startPromise2 = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        room.typing
          .stop()
          .then(() => {
            resolveOrder.push('stopPromise');
            resolve();
          })
          .catch(reject);
      }, 100); // 100ms delay
    });

    // Wait for both to complete
    await Promise.all([startPromise1, startPromise2]);

    // Validate that `publish` was called twice
    expect(publishSpy).toHaveBeenCalledTimes(2);

    // Ensure that the promises resolved in the correct order
    expect(resolveOrder).toEqual(['startPromise', 'stopPromise']);

    // Cleanup mocks
    publishSpy.mockRestore();
  });

  // CHA-T4
  describe('start typing', () => {
    // CHA-T4d
    it<TestContext>('does not allow typing start if channel is not attached or attaching', async (context) => {
      const { room } = context;
      vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('detached');

      await expect(room.typing.keystroke()).rejects.toBeErrorInfoWithCode(50000);
    });

    // CHA-T4a
    it<TestContext>('starts typing', async (context) => {
      const { room, realtime } = context;
      const channel = room.typing.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // If start is called, it should publish a start message
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
      vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('attached');

      // Start typing
      await room.typing.keystroke();

      // Ensure that publish was called with typing.started
      expect(realtimeChannel.publish).toHaveBeenCalledTimes(1);
      expect(realtimeChannel.publish).toHaveBeenCalledWith(startMessage);

      // Check that our timers have been set
      const defaultTyping = room.typing as TestTypingInterface;

      // CHA-T4a4
      expect(defaultTyping._heartbeatTimerId).toBeDefined();
    });

    // CHA-T4c1
    it<TestContext>('does not start typing if already typing', async (context) => {
      const { room, realtime } = context;
      const channel = room.typing.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // If start is called, it should publish a start message
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
      vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('attached');

      // Start typing
      await room.typing.keystroke();

      // Ensure that publish was called with typing.started
      expect(realtimeChannel.publish).toHaveBeenCalledTimes(1);
      expect(realtimeChannel.publish).toHaveBeenCalledWith(startMessage);

      // Check that our timers have been set
      const defaultTyping = room.typing as TestTypingInterface;

      // CHA-T4a4
      expect(defaultTyping._heartbeatTimerId).toBeDefined();

      // Start typing again
      await room.typing.keystroke();

      // Ensure that publish was not called again
      expect(realtimeChannel.publish).toHaveBeenCalledTimes(1);
    });

    describe<TestContext>('explicit typing stop', () => {
      // CHA-T5a
      it<TestContext>('is no-op if stop called whilst not typing', async (context) => {
        const { room, realtime } = context;
        const channel = room.typing.channel;
        const realtimeChannel = realtime.channels.get(channel.name);

        // If stop is called, the test should fail as the timer should not have expired
        vi.spyOn(room.typing, 'stop').mockImplementation(async (): Promise<void> => {});
        vi.spyOn(room.typing.channel, 'publish').mockImplementation(async (): Promise<void> => {});
        vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('attached');

        // Stop typing
        await room.typing.stop();

        // Ensure that no messages were sent
        expect(realtimeChannel.publish).not.toHaveBeenCalled();
      });

      // CHA-T5c
      it<TestContext>('throws an error if typing.stop is called when the channel is not attached', async (context) => {
        const { room, realtime } = context;
        const channel = room.typing.channel;
        const realtimeChannel = realtime.channels.get(channel.name);
        vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
        vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('attached');
        await room.typing.keystroke();
        vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('detached');

        await expect(room.typing.stop()).rejects.toBeErrorInfoWithCode(50000);

        // Check that no messages were sent
        expect(realtimeChannel.publish).toHaveBeenCalledTimes(1);
      });

      it<TestContext>('when stop is called, immediately stops typing', async (context) => {
        const { realtime, room } = context;
        const channel = room.typing.channel;
        const realtimeChannel = realtime.channels.get(channel.name);

        // If stop is called, it should publish a leave message
        vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
        vi.spyOn(room.typing.channel, 'state', 'get').mockReturnValue('attached');

        // Start typing and then immediately stop typing
        await room.typing.keystroke();
        await room.typing.stop();

        expect(realtimeChannel.publish).toHaveBeenCalledTimes(2);
        // Ensure that publish was called with typing.started only once
        expect(realtimeChannel.publish).toHaveBeenCalledWith(startMessage);
        // Ensure that publish was called with typing.stopped only once
        expect(realtimeChannel.publish).toHaveBeenCalledWith(stopMessage);

        // Check that the timers have been cleared
        const defaultTyping = room.typing as TestTypingInterface;
        expect(defaultTyping._heartbeatTimerId).toBeUndefined();
      });
    });

    describe<TestContext>('typing subscriptions', () => {
      beforeEach<TestContext>(() => {
        vi.useFakeTimers();
      });

      afterEach<TestContext>(() => {
        vi.useRealTimers();
      });

      // CHA-T6a, CHA-T6b
      it<TestContext>('allows listeners to be subscribed and unsubscribed', async (context) => {
        const { room } = context;

        // Add a listener
        const receivedEvents: TypingEvent[] = [];
        const { unsubscribe } = room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Another listener used to receive all events, to make sure events were emitted
        const allEvents: TypingEvent[] = [];
        const allSubscription = room.typing.subscribe((event: TypingEvent) => {
          allEvents.push(event);
        });

        // Emulate a typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        await waitForArrayLength(receivedEvents, 1);

        // Ensure that the listener received the event
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        // Unsubscribe the listener
        unsubscribe();

        // Emulate another typing event for anotherClient
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'anotherClient',
        });

        // wait for check events to be length 2 to make sure second event was triggered
        await waitForArrayLength(allEvents, 2);
        expect(allEvents.length).toEqual(2);
        expect(allEvents[1]?.currentlyTyping).toEqual(new Set(['otherClient', 'anotherClient']));

        // Ensure that the listener did not receive the event
        expect(receivedEvents).toHaveLength(1);

        // Calling unsubscribe again should not throw
        unsubscribe();

        allSubscription.unsubscribe();
      });

      // CHA-T6b
      it<TestContext>('allows all listeners to be unsubscribed at once', async (context) => {
        const { room } = context;

        // Add a listener
        const receivedEvents: TypingEvent[] = [];
        const { unsubscribe } = room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Add another
        const receivedEvents2: TypingEvent[] = [];
        const { unsubscribe: unsubscribe2 } = room.typing.subscribe((event: TypingEvent) => {
          receivedEvents2.push(event);
        });

        // Emulate a typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        await waitForArrayLength(receivedEvents, 1);

        // Ensure that the listener received the event
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        await waitForArrayLength(receivedEvents2, 1);
        // Ensure that the second listener received the event
        expect(receivedEvents2).toHaveLength(1);
        expect(receivedEvents2[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        // Unsubscribe all listeners
        room.typing.unsubscribeAll();

        // subscribe a check subscriber
        const checkEvents: TypingEvent[] = [];
        room.typing.subscribe((event) => {
          checkEvents.push(event);
        });

        // Emulate another typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'anotherClient2',
        });

        await waitForArrayLength(checkEvents, 1);
        expect(checkEvents[0]?.currentlyTyping).toEqual(new Set(['otherClient', 'anotherClient2']));

        // Ensure that the listeners did not receive the event
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents2).toHaveLength(1);

        // Calling unsubscribe should not throw
        unsubscribe();
        unsubscribe2();
      });

      // CHA-T13a
      describe.each([
        [
          'no client id',
          {
            name: TypingEvents.Start,
            connectionId: '',
            id: '',
            encoding: '',
            timestamp: 0,
            extras: {},
            data: {},
          } as Ably.InboundMessage,
        ],
        [
          'empty client id',
          {
            name: TypingEvents.Start,
            clientId: '',
            connectionId: '',
            id: '',
            encoding: '',
            timestamp: 0,
            extras: {},
            data: {},
          } as Ably.InboundMessage,
        ],
        [
          'unhandled event name',
          {
            name: 'notATypingEvent',
            clientId: 'someClient',
            connectionId: '',
            id: '',
            encoding: '',
            timestamp: 0,
            extras: {},
            data: {},
          } as Ably.InboundMessage,
        ],
      ])('invalid incoming typing messages: %s', (description: string, inbound: Ably.InboundMessage) => {
        test<TestContext>(`does not process invalid incoming typing messages: ${description}`, (context) => {
          const { room } = context;

          // Subscribe to typing events
          const receivedEvents: TypingEvent[] = [];
          room.typing.subscribe((event: TypingEvent) => {
            receivedEvents.push(event);
          });

          // Emulate a typing event
          context.emulateBackendPublish({
            ...inbound,
          } as Ably.InboundMessage);

          // Ensure that no typing events were received
          expect(receivedEvents).toHaveLength(0);
        });
      });

      // CHA-T13b1
      it<TestContext>('starts typing for inbound typing start event', async (context) => {
        const { room } = context;

        // Subscribe to typing events
        const receivedEvents: TypingEvent[] = [];
        room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Emulate a typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        // Ensure that the listener received the event
        await waitForArrayLength(receivedEvents, 1);
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        // Check our current typers
        expect(room.typing.get()).toEqual(new Set(['otherClient']));

        // Check we have an active timer
        const defaultTyping = room.typing as TestTypingInterface;
        const inactivity = defaultTyping._currentlyTyping.get('otherClient');
        expect(inactivity).toBeDefined();
      });

      // CHA-T13b2
      it<TestContext>('resets the inactivity timer on inbound typing start event', async (context) => {
        const { room } = context;

        // Subscribe to typing events
        const receivedEvents: TypingEvent[] = [];
        room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Emulate a typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        // Ensure that the listener received the event
        await waitForArrayLength(receivedEvents, 1);
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        // Get current inactivity timer
        const defaultTyping = room.typing as TestTypingInterface;
        const inactivity = defaultTyping._currentlyTyping.get('otherClient');
        expect(inactivity).toBeDefined();

        // Now send another typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        // Check that eventually (yay promises), the inactivity timer has been reset
        await vi.waitFor(
          () => {
            const newInactivity = defaultTyping._currentlyTyping.get('otherClient');
            expect(newInactivity).toBeDefined();
            expect(newInactivity).not.toBe(inactivity);
          },
          { timeout: 1000 },
        );
      });

      // CHA-T13b3
      it<TestContext>('emits a typing stop event when the inactivity timer expires', async (context) => {
        const { room } = context;

        // Subscribe to typing events
        const receivedEvents: TypingEvent[] = [];
        room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Emulate a typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        // Ensure that the listener received the event
        await waitForArrayLength(receivedEvents, 1);
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        // Get current inactivity timer
        const defaultTyping = room.typing as TestTypingInterface;
        const inactivity = defaultTyping._currentlyTyping.get('otherClient');
        expect(inactivity).toBeDefined();

        // Expire the inactivity timer
        vi.advanceTimersToNextTimer();

        // Ensure that the listener received the event
        await waitForArrayLength(receivedEvents, 2);
        expect(receivedEvents).toHaveLength(2);
        expect(receivedEvents[1]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Stop,
          },
          currentlyTyping: new Set(),
        });
      });

      // CHA-T13b4
      it<TestContext>('stops typing for inbound typing stop event', async (context) => {
        const { room } = context;

        // Subscribe to typing events
        const receivedEvents: TypingEvent[] = [];
        room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Emulate a typing event
        context.emulateBackendPublish({
          name: TypingEvents.Start,
          clientId: 'otherClient',
        });

        // Ensure that the listener received the event
        await waitForArrayLength(receivedEvents, 1);
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Start,
          },
          currentlyTyping: new Set(['otherClient']),
        });

        // Get current inactivity timer
        const defaultTyping = room.typing as TestTypingInterface;
        const inactivity = defaultTyping._currentlyTyping.get('otherClient');
        expect(inactivity).toBeDefined();

        // Emulate a typing stop event
        context.emulateBackendPublish({
          name: TypingEvents.Stop,
          clientId: 'otherClient',
        });

        // Ensure that the listener received the event
        await waitForArrayLength(receivedEvents, 2);
        expect(receivedEvents).toHaveLength(2);
        expect(receivedEvents[1]).toEqual({
          change: {
            clientId: 'otherClient',
            type: TypingEvents.Stop,
          },
          currentlyTyping: new Set(),
        });

        // Check that the inactivity timer has been cleared
        expect(defaultTyping._currentlyTyping.get('otherClient')).toBeUndefined();
      });

      // CHA-T13b5
      it<TestContext>('ignores stopped typing events for clients not currently typing', (context) => {
        const { room } = context;

        // Subscribe to typing events
        const receivedEvents: TypingEvent[] = [];
        room.typing.subscribe((event: TypingEvent) => {
          receivedEvents.push(event);
        });

        // Emulate a typing stop event
        context.emulateBackendPublish({
          name: TypingEvents.Stop,
          clientId: 'otherClient',
        });

        // Ensure that no typing events were received
        expect(receivedEvents).toHaveLength(0);
      });
    });

    it<TestContext>('has an attachment error code', (context) => {
      expect((context.room.typing as DefaultTyping).attachmentErrorCode).toBe(102005);
    });

    it<TestContext>('has a detachment error code', (context) => {
      expect((context.room.typing as DefaultTyping).detachmentErrorCode).toBe(102054);
    });
  });
});
