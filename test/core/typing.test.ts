import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { ChatClient } from '../../src/core/chat-client.ts';
import { ConnectionStatus } from '../../src/core/connection.ts';
import { TypingEventType, TypingSetEvent, TypingSetEventType } from '../../src/core/events.ts';
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
  name: TypingEventType.Started,
  extras: {
    ephemeral: true,
  },
};

const stopMessage: Ably.Message = {
  name: TypingEventType.Stopped,
  extras: {
    ephemeral: true,
  },
};

// This interface simply extends the DefaultTyping interface and exposes some private properties for testing
interface TestTypingInterface extends Typing {
  _heartbeatTimerId: ReturnType<typeof setTimeout> | undefined;
  _currentlyTyping: Map<string, ReturnType<typeof setTimeout>>;
}

interface TestRoomInterface extends Room {
  release: () => Promise<void>;
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
    context.room = makeRandomRoom({
      ...context,
    });
    const channel = context.room.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);
  });

  // CHA-T8
  it<TestContext>('uses the correct realtime channel', (context) => {
    const typing = context.room.typing as DefaultTyping;

    expect(typing.channel.name).toBe(`${context.room.name}::$chat`);
  });

  // CHA-T9
  it<TestContext>('gets current typers', (context) => {
    const { room } = context;

    // Emulate a typing event
    context.emulateBackendPublish({
      name: TypingEventType.Started,
      clientId: 'some',
    });

    // Ensure that the typing status is correct
    expect(room.typing.current()).toEqual(new Set(['some']));
  });

  it<TestContext>('ensures multiple keystroke/stop calls are resolved in order', async (context) => {
    const { room, realtime } = context;
    const channel = room.channel;
    const realtimeChannel = realtime.channels.get(channel.name);

    // Mock implementation for `publish` to simulate delay in the call on the first invocation
    const publishSpy = vi
      .spyOn(realtimeChannel, 'publish')
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 300)), // Simulate 300ms delay in publish
      )
      .mockImplementationOnce(() => Promise.resolve());

    // Needed to allow typing calls to proceed
    vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

    // To track resolution order
    const resolveOrder: string[] = [];

    // Start the first typing operation
    const keystrokePromise = new Promise<void>((resolve, reject) => {
      room.typing
        .keystroke()
        .then(() => {
          resolveOrder.push('keystrokePromise');
          resolve();
        })
        .catch(reject);
    });

    // Start the second operation with a short delay of 100ms,
    // this is smaller than the delay in the mock publish of 300ms.
    // The `stop` call should await before the `keystroke` call has resolved, but only resolve itself after.
    const stopPromise = new Promise<void>((resolve, reject) => {
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
    await Promise.all([keystrokePromise, stopPromise]);

    // Validate that `publish` was called twice
    expect(publishSpy).toHaveBeenCalledTimes(2);

    // Ensure that the promises resolved in the correct order
    expect(resolveOrder).toEqual(['keystrokePromise', 'stopPromise']);

    // Cleanup mocks
    publishSpy.mockRestore();
  });

  // CHA-T4
  describe('start typing', () => {
    // CHA-T4a
    it<TestContext>('starts typing', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // If start is called, it should publish a start message
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

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
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // If start is called, it should publish a start message
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

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

    // CHA-T4e
    it<TestContext>('does not allow typing start if connection is not connected', async (context) => {
      const { room } = context;
      vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue(ConnectionStatus.Disconnected);

      // Start typing
      await expect(room.typing.keystroke()).rejects.toBeErrorInfoWithCode(40000);
    });

    it<TestContext>('cancels stop operation when interrupted by subsequent keystroke', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // Mock implementation for `publish` to simulate 1s delay on the first keystroke call
      const publishSpy = vi
        .spyOn(realtimeChannel, 'publish')
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(resolve, 1000)), // Simulate 1s delay
        )
        .mockImplementation(() => Promise.resolve()); // All subsequent calls resolve immediately

      // Needed to allow typing calls to proceed
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Start the first keystroke operation (this will be delayed by 1s)
      const firstKeystrokePromise = room.typing.keystroke();

      // After 250ms, call stop
      const stopPromise = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          room.typing
            .stop()
            .then(() => {
              resolve();
            })
            .catch(reject);
        }, 250);
      });

      // Then immediately call keystroke again
      const secondKeystrokePromise = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          room.typing
            .keystroke()
            .then(() => {
              resolve();
            })
            .catch(reject);
        }, 300); // Slightly after the stop call
      });

      // Wait for all operations to complete
      await Promise.all([firstKeystrokePromise, stopPromise, secondKeystrokePromise]);

      // The stop operation should have been canceled, so we should only see start events
      // First keystroke should send a start event, stop should be canceled (no stop event),
      // second keystroke should be a no-op since already typing
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledWith(startMessage);

      // Cleanup mocks
      publishSpy.mockRestore();
    }, 5000); // Set timeout to 5 seconds to handle the 1s delay
  });

  describe<TestContext>('explicit typing stop', () => {
    // CHA-T5a
    it<TestContext>('is no-op if stop called whilst not typing', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      vi.spyOn(room.channel, 'publish').mockImplementation(async (): Promise<void> => {});
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Stop typing
      await room.typing.stop();

      // Ensure that no messages were sent
      expect(realtimeChannel.publish).not.toHaveBeenCalled();
    });

    // CHA-T5f
    it<TestContext>('throws an error if typing.stop is called when the connection is not connected', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
      await room.typing.keystroke();
      vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue(ConnectionStatus.Disconnected);

      await expect(room.typing.stop()).rejects.toBeErrorInfoWithCode(40000);

      // Check that no messages were sent
      expect(realtimeChannel.publish).toHaveBeenCalledTimes(1);
    });

    it<TestContext>('when stop is called, immediately stops typing', async (context) => {
      const { realtime, room } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // If stop is called, it should publish a leave message
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      await Promise.all([room.typing.keystroke(), room.typing.stop()]);

      expect(realtimeChannel.publish).toHaveBeenCalledTimes(2);
      // Ensure that publish was called with typing.started only once
      expect(realtimeChannel.publish).toHaveBeenNthCalledWith(1, startMessage);
      // Ensure that publish was called with typing.stopped only once
      expect(realtimeChannel.publish).toHaveBeenNthCalledWith(2, stopMessage);

      // Check that the timers have been cleared
      const defaultTyping = room.typing as TestTypingInterface;
      expect(defaultTyping._heartbeatTimerId).toBeUndefined();
    });

    it<TestContext>('cancels keystroke operation when interrupted by subsequent stop', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);

      // Mock implementation for `publish` to simulate 1s delay on the first keystroke call
      const publishSpy = vi
        .spyOn(realtimeChannel, 'publish')
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(resolve, 1000)), // Simulate 1s delay on first keystroke
        )
        .mockImplementation(() => Promise.resolve()); // All subsequent calls resolve immediately

      // Needed to allow typing calls to proceed
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Start the first keystroke operation (this will be delayed by 1s)
      const firstKeystrokePromise = room.typing.keystroke();

      // After 250ms, call keystroke again
      const secondKeystrokePromise = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          room.typing
            .keystroke()
            .then(() => {
              resolve();
            })
            .catch(reject);
        }, 250);
      });

      // Then call stop
      const stopPromise = new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          void room.typing
            .stop()
            .catch((error: unknown) => {
              // Stop should be rejected since we're disposed
              expect(error).toBeErrorInfoWithCode(40000);
            })
            .finally(() => {
              clearTimeout(timeoutId);
              resolve();
            });
        }, 300);
      });

      // Wait for all operations to complete
      await Promise.all([firstKeystrokePromise, secondKeystrokePromise, stopPromise]);

      // The second keystroke operation should have been canceled by the stop, so we should see start + stop events
      // First keystroke should send a start event, second keystroke should be canceled by stop,
      // stop should send a stop event
      expect(publishSpy).toHaveBeenCalledTimes(2);
      expect(publishSpy).toHaveBeenNthCalledWith(1, startMessage);
      expect(publishSpy).toHaveBeenNthCalledWith(2, stopMessage);

      // Cleanup mocks
      publishSpy.mockRestore();
    }, 5000); // Set timeout to 5 seconds to handle the 1s delay
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
      const receivedEvents: TypingSetEvent[] = [];
      const { unsubscribe } = room.typing.subscribe((event: TypingSetEvent) => {
        receivedEvents.push(event);
      });

      // Another listener used to receive all events, to make sure events were emitted
      const allEvents: TypingSetEvent[] = [];
      const allSubscription = room.typing.subscribe((event: TypingSetEvent) => {
        allEvents.push(event);
      });

      // Emulate a typing event
      context.emulateBackendPublish({
        name: TypingEventType.Started,
        clientId: 'otherClient',
      });

      await waitForArrayLength(receivedEvents, 1);

      // Ensure that the listener received the event
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Started,
        },
        currentlyTyping: new Set(['otherClient']),
      });

      // Unsubscribe the listener
      unsubscribe();

      // Emulate another typing event for anotherClient
      context.emulateBackendPublish({
        name: TypingEventType.Started,
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

    // CHA-T13a
    describe.each([
      [
        'no client id',
        {
          name: TypingEventType.Started,
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
          name: TypingEventType.Started,
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
        const receivedEvents: TypingSetEvent[] = [];
        room.typing.subscribe((event: TypingSetEvent) => {
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
      const receivedEvents: TypingSetEvent[] = [];
      room.typing.subscribe((event: TypingSetEvent) => {
        receivedEvents.push(event);
      });

      // Emulate a typing event
      context.emulateBackendPublish({
        name: TypingEventType.Started,
        clientId: 'otherClient',
      });

      // Ensure that the listener received the event
      await waitForArrayLength(receivedEvents, 1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Started,
        },
        currentlyTyping: new Set(['otherClient']),
      });

      // Check our current typers
      expect(room.typing.current()).toEqual(new Set(['otherClient']));

      // Check we have an active timer
      const defaultTyping = room.typing as TestTypingInterface;
      const inactivity = defaultTyping._currentlyTyping.get('otherClient');
      expect(inactivity).toBeDefined();
    });

    // CHA-T13b2
    it<TestContext>('resets the inactivity timer on inbound typing start event', async (context) => {
      const { room } = context;

      // Subscribe to typing events
      const receivedEvents: TypingSetEvent[] = [];
      room.typing.subscribe((event: TypingSetEvent) => {
        receivedEvents.push(event);
      });

      // Emulate a typing event
      context.emulateBackendPublish({
        name: TypingEventType.Started,
        clientId: 'otherClient',
      });

      // Ensure that the listener received the event
      await waitForArrayLength(receivedEvents, 1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Started,
        },
        currentlyTyping: new Set(['otherClient']),
      });

      // Get current inactivity timer
      const defaultTyping = room.typing as TestTypingInterface;
      const inactivity = defaultTyping._currentlyTyping.get('otherClient');
      expect(inactivity).toBeDefined();

      // Now send another typing event
      context.emulateBackendPublish({
        name: TypingEventType.Started,
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
      const receivedEvents: TypingSetEvent[] = [];
      room.typing.subscribe((event: TypingSetEvent) => {
        receivedEvents.push(event);
      });

      // Emulate a typing event
      context.emulateBackendPublish({
        name: TypingEventType.Started,
        clientId: 'otherClient',
      });

      // Ensure that the listener received the event
      await waitForArrayLength(receivedEvents, 1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Started,
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
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Stopped,
        },
        currentlyTyping: new Set(),
      });
    });

    // CHA-T13b4
    it<TestContext>('stops typing for inbound typing stop event', async (context) => {
      const { room } = context;

      // Subscribe to typing events
      const receivedEvents: TypingSetEvent[] = [];
      room.typing.subscribe((event: TypingSetEvent) => {
        receivedEvents.push(event);
      });

      // Emulate a typing event
      context.emulateBackendPublish({
        name: TypingEventType.Started,
        clientId: 'otherClient',
      });

      // Ensure that the listener received the event
      await waitForArrayLength(receivedEvents, 1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Started,
        },
        currentlyTyping: new Set(['otherClient']),
      });

      // Get current inactivity timer
      const defaultTyping = room.typing as TestTypingInterface;
      const inactivity = defaultTyping._currentlyTyping.get('otherClient');
      expect(inactivity).toBeDefined();

      // Emulate a typing stop event
      context.emulateBackendPublish({
        name: TypingEventType.Stopped,
        clientId: 'otherClient',
      });

      // Ensure that the listener received the event
      await waitForArrayLength(receivedEvents, 2);
      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[1]).toEqual({
        type: TypingSetEventType.SetChanged,
        change: {
          clientId: 'otherClient',
          type: TypingEventType.Stopped,
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
      const receivedEvents: TypingSetEvent[] = [];
      room.typing.subscribe((event: TypingSetEvent) => {
        receivedEvents.push(event);
      });

      // Emulate a typing stop event
      context.emulateBackendPublish({
        name: TypingEventType.Stopped,
        clientId: 'otherClient',
      });

      // Ensure that no typing events were received
      expect(receivedEvents).toHaveLength(0);
    });

    it<TestContext>('should only unsubscribe the correct subscription', async (context) => {
      const { room } = context;
      const received: TypingSetEvent[] = [];

      const emulateTypingEvent = (clientId: string, event: TypingEventType) => {
        context.emulateBackendPublish({
          name: event,
          clientId: clientId,
        });
      };

      const listener = (event: TypingSetEvent) => {
        received.push(event);
      };

      // Subscribe the same listener twice
      const subscription1 = room.typing.subscribe(listener);
      const subscription2 = room.typing.subscribe(listener);

      // Both subscriptions should trigger the listener
      emulateTypingEvent('user1', TypingEventType.Started);
      await waitForArrayLength(received, 2);

      // Unsubscribe first subscription
      subscription1.unsubscribe();

      // One subscription should still trigger the listener
      emulateTypingEvent('user2', TypingEventType.Started);
      emulateTypingEvent('user2', TypingEventType.Started);
      await waitForArrayLength(received, 3);

      // Unsubscribe second subscription
      subscription2.unsubscribe();
    });
  });

  describe('handle room release', () => {
    it<TestContext>('clears typing resources when channel is released', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);
      const defaultTyping = room.typing as TestTypingInterface;
      const defaultRoom = room as TestRoomInterface;
      // Mock implementation for `publish` to simulate successful publish
      vi.spyOn(realtimeChannel, 'publish').mockImplementation(() => Promise.resolve());

      // Put the room into the attached state
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Add a typing user to the state
      context.emulateBackendPublish({
        name: TypingEventType.Started,
        clientId: 'user1',
      });
      expect(defaultTyping._currentlyTyping.get('user1')).toBeDefined();

      // Start typing to set the heartbeat timer
      await room.typing.keystroke();

      // Get the typing instance and check internal state
      expect(defaultTyping._heartbeatTimerId).toBeDefined();

      // Release the room
      await defaultRoom.release();

      // Verify that the heartbeat timer is cleared
      expect(defaultTyping._heartbeatTimerId).toBeUndefined();
      // Verify that the typing set is cleared
      expect(defaultTyping._currentlyTyping.get('user1')).toBeUndefined();
    });

    it<TestContext>('cancels ongoing operations when disposed', async (context) => {
      const { room, realtime } = context;
      const channel = room.channel;
      const realtimeChannel = realtime.channels.get(channel.name);
      const defaultTyping = room.typing as TestTypingInterface;

      // Mock implementation for `publish` to simulate 1s delay on the keystroke call
      const publishSpy = vi
        .spyOn(realtimeChannel, 'publish')
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(resolve, 2000)), // Simulate 2s delay
        )
        .mockImplementation(() => Promise.resolve()); // All subsequent calls resolve immediately

      // Needed to allow typing calls to proceed
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Start the keystroke operation (this will be delayed by 1s)
      const keystrokePromise = room.typing.keystroke().catch(() => {
        // Keystroke might be rejected due to dispose, which is fine
      });

      // After 250ms, call dispose
      const disposePromise = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          (room.typing as DefaultTyping)
            .dispose()
            .then(() => {
              resolve();
            })
            .catch(reject);
        }, 250);
      });

      // After 300ms, call stop
      // This will cancel the
      const stopPromise = new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          void room.typing
            .stop()
            .catch((error: unknown) => {
              // Stop should be rejected since we're disposed
              expect(error).toBeErrorInfoWithCode(40000);
            })
            .finally(() => {
              clearTimeout(timeoutId);
              resolve();
            });
        }, 300);
      });

      // Wait for all operations to complete
      await Promise.all([keystrokePromise, disposePromise, stopPromise]);

      // The keystroke operation should have started (publish called once with start)
      // but no other operations should have completed
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledWith(startMessage);

      // Verify that typing resources were cleared
      expect(defaultTyping._heartbeatTimerId).toBeUndefined();
      expect(defaultTyping._currentlyTyping.size).toBe(0);

      // Cleanup mocks
      publishSpy.mockRestore();
    }, 5000); // Set timeout to 5 seconds to handle the 1s delay
  });
});
