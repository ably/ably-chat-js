import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { ChatApi } from '../../src/core/chat-api.ts';
import { TypingEventPayload, TypingEvents } from '../../src/core/events.ts';
import { Room } from '../../src/core/room.ts';
import { RoomOptions } from '../../src/core/room-options.ts';
import { DefaultTyping } from '../../src/core/typing.ts';
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
}

const TEST_TYPING_TIMEOUT_MS = 200;
const TEST_INACTIVITY_TIMEOUT_MS = 400;
const TEST_HEARTBEAT_INTERVAL_MS = 100;

vi.mock('ably');

describe('Typing', () => {
  beforeEach<TestContext>((context) => {
    context.options = {
      typing: {
        timeoutMs: TEST_TYPING_TIMEOUT_MS,
        inactivityTimeoutMs: TEST_INACTIVITY_TIMEOUT_MS,
        heartbeatIntervalMs: TEST_HEARTBEAT_INTERVAL_MS,
      },
    };
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom(context);
    const channel = context.room.typing.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);
  });

  it<TestContext>('delays stop timeout while still typing', async (context) => {
    const { room } = context;
    // If stop is called, the test should fail as the timer should not have expired
    vi.spyOn(room.typing, 'stop').mockImplementation(async (): Promise<void> => {});
    vi.spyOn(room.typing.channel, 'publish').mockImplementation(async (): Promise<void> => {});
    // Start typing - we will wait/type a few times to ensure the timer is resetting
    await room.typing.start();
    // wait for half the timers timeout
    await new Promise((resolve) => setTimeout(resolve, TEST_TYPING_TIMEOUT_MS / 2));
    // Start typing again to reset the timer
    await room.typing.start();
    // wait for half the timers timeout
    await new Promise((resolve) => setTimeout(resolve, TEST_TYPING_TIMEOUT_MS / 2));
    // Start typing again to reset the timer
    await room.typing.start();
    // wait for half the timers timeout
    await new Promise((resolve) => setTimeout(resolve, TEST_TYPING_TIMEOUT_MS / 2));
    // Should have waited 1.5x the timeout at this point

    // Ensure that stop was not called
    expect(room.typing.stop).not.toHaveBeenCalled();
  });

  it<TestContext>('when stop is called, immediately stops typing', async (context) => {
    const { realtime, room } = context;
    const channel = room.typing.channel;
    const realtimeChannel = realtime.channels.get(channel.name);

    // If stop is called, it should publish a leave message
    vi.spyOn(realtimeChannel, 'publish').mockImplementation(async (): Promise<void> => {});

    // Start typing and then immediately stop typing
    await room.typing.start();
    await room.typing.stop();

    // The timer should be stopped and so waiting beyond timeout should not trigger stop again
    await new Promise((resolve) => setTimeout(resolve, TEST_TYPING_TIMEOUT_MS * 2));

    expect(realtimeChannel.publish).toHaveBeenCalledTimes(2);
    // Ensure that publish was called with typing.started only once
    expect(realtimeChannel.publish).toHaveBeenCalledWith(TypingEvents.Start, {});
    // Ensure that publish was called with typing.stopped only once
    expect(realtimeChannel.publish).toHaveBeenCalledWith(TypingEvents.Stop, {});
  });

  it<TestContext>('allows listeners to be unsubscribed', async (context) => {
    const { room } = context;

    // Add a listener
    const receivedEvents: TypingEventPayload[] = [];
    const { unsubscribe } = room.typing.subscribe((event: TypingEventPayload) => {
      receivedEvents.push(event);
    });

    // Another listener used to receive all events, to make sure events were emitted
    const allEvents: TypingEventPayload[] = [];
    const allSubscription = room.typing.subscribe((event: TypingEventPayload) => {
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
      type: TypingEvents.Start,
      clientId: 'otherClient',
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

  it<TestContext>('allows all listeners to be unsubscribed at once', async (context) => {
    const { room } = context;

    // Add a listener
    const receivedEvents: TypingEventPayload[] = [];
    const { unsubscribe } = room.typing.subscribe((event: TypingEventPayload) => {
      receivedEvents.push(event);
    });

    // Add another
    const receivedEvents2: TypingEventPayload[] = [];
    const { unsubscribe: unsubscribe2 } = room.typing.subscribe((event: TypingEventPayload) => {
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
      type: TypingEvents.Start,
      clientId: 'otherClient',
      currentlyTyping: new Set(['otherClient']),
    });

    await waitForArrayLength(receivedEvents2, 1);
    // Ensure that the second listener received the event
    expect(receivedEvents2).toHaveLength(1);
    expect(receivedEvents2[0]).toEqual({
      type: TypingEvents.Start,
      clientId: 'otherClient',
      currentlyTyping: new Set(['otherClient']),
    });

    // Unsubscribe all listeners
    room.typing.unsubscribeAll();

    // subscribe a check subscriber
    const checkEvents: TypingEventPayload[] = [];
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

  it<TestContext>('should only unsubscribe the correct subscription', async (context) => {
    const { room } = context;
    const received: TypingEventPayload[] = [];

    const emulateTypingEvent = (clientId: string, event: TypingEvents) => {
      context.emulateBackendPublish({
        name: event,
        clientId: clientId,
      });
    };

    const channel = context.room.typing.channel;
    const listener = (event: TypingEventPayload) => {
      received.push(event);
    };

    // Subscribe the same listener twice
    const subscription1 = room.typing.subscribe(listener);
    const subscription2 = room.typing.subscribe(listener);

    // Both subscriptions should trigger the listener
    emulateTypingEvent('user1', TypingEvents.Start);
    await waitForArrayLength(received, 2);

    // Unsubscribe first subscription
    subscription1.unsubscribe();

    // One subscription should still trigger the listener
    emulateTypingEvent('user2', TypingEvents.Start);
    emulateTypingEvent('user2', TypingEvents.Start);
    await waitForArrayLength(received, 3);

    // Unsubscribe second subscription
    subscription2.unsubscribe();
  });

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
      const receivedEvents: TypingEventPayload[] = [];
      room.typing.subscribe((event: TypingEventPayload) => {
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

  it<TestContext>('has an attachment error code', (context) => {
    expect((context.room.typing as DefaultTyping).attachmentErrorCode).toBe(102005);
  });

  it<TestContext>('has a detachment error code', (context) => {
    expect((context.room.typing as DefaultTyping).detachmentErrorCode).toBe(102054);
  });
});
