import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatClient } from '../src/Chat.js';
import { ChatApi } from '../src/ChatApi.js';
import { Room } from '../src/Room.js';
import { DefaultTyping, TypingEvent } from '../src/Typing.js';
import { ChannelEventEmitterReturnType, channelPresenceEventEmitter } from './helper/channel.js';
import { makeTestLogger } from './helper/logger.js';
import { makeRandomRoom } from './helper/room.js';

interface TestContext {
  realtime: Ably.Realtime;
  chat: ChatClient;
  chatApi: ChatApi;
  room: Room;
  emulateBackendPublish: ChannelEventEmitterReturnType<Partial<Ably.PresenceMessage>>;
}

const TEST_TYPING_TIMEOUT_MS = 100;

vi.mock('ably');

describe('Typing', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom(context);
    context.emulateBackendPublish = channelPresenceEventEmitter(context.room.typing.channel);
  });

  it<TestContext>('delays stop timeout while still typing', async (context) => {
    const { room } = context;
    // If stop is called, the test should fail as the timer should not have expired
    vi.spyOn(room.typing, 'stop').mockImplementation(async (): Promise<void> => {
      return Promise.resolve();
    });
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
    const presence = realtime.channels.get(room.typing.channel.name).presence;

    // If stop is called, it should call leaveClient
    vi.spyOn(presence, 'leaveClient').mockImplementation(async (): Promise<void> => {
      return Promise.resolve();
    });

    // Start typing and then immediately stop typing
    await room.typing.start();
    await room.typing.stop();

    // The timer should be stopped and so waiting beyond timeout should not trigger stop again
    await new Promise((resolve) => setTimeout(resolve, TEST_TYPING_TIMEOUT_MS * 2));

    // Ensure that leaveClient was called only once by the stop method and not again when the timer expires
    expect(presence.leaveClient).toHaveBeenCalledOnce();
  });

  it<TestContext>('allows listeners to be unsubscribed', (context) => {
    const { room } = context;

    // Add a listener
    const receivedEvents: TypingEvent[] = [];
    const { unsubscribe } = room.typing.subscribe((event: TypingEvent) => {
      receivedEvents.push(event);
    });

    // Emulate a typing event
    context.emulateBackendPublish({
      clientId: 'otherClient',
      action: 'enter',
    });

    // Ensure that the listener received the event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      change: {
        clientId: 'otherClient',
        isTyping: true,
      },
      currentlyTyping: new Set(['otherClient']),
    });

    // Unsubscribe the listener
    unsubscribe();

    // Emulate another typing event
    context.emulateBackendPublish({
      clientId: 'anotherClient',
      action: 'enter',
    });

    // Ensure that the listener did not receive the event
    expect(receivedEvents).toHaveLength(1);

    // Calling unsubscribe again should not throw
    unsubscribe();
  });

  it<TestContext>('allows all listeners to be unsubscribed at once', (context) => {
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
      clientId: 'otherClient',
      action: 'enter',
    });

    // Ensure that the listener received the event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      change: {
        clientId: 'otherClient',
        isTyping: true,
      },
      currentlyTyping: new Set(['otherClient']),
    });

    // Ensure that the second listener received the event
    expect(receivedEvents2).toHaveLength(1);
    expect(receivedEvents2[0]).toEqual({
      change: {
        clientId: 'otherClient',
        isTyping: true,
      },
      currentlyTyping: new Set(['otherClient']),
    });

    // Unsubscribe all listeners
    room.typing.unsubscribeAll();

    // Emulate another typing event
    context.emulateBackendPublish({
      clientId: 'anotherClient2',
      action: 'enter',
    });

    // Ensure that the listeners did not receive the event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents2).toHaveLength(1);

    // Calling unsubscribe should not throw
    unsubscribe();
    unsubscribe2();
  });

  type PresenceTestParam = Omit<Ably.PresenceMessage, 'action' | 'clientId'>;

  describe.each([
    ['no client id', { connectionId: '', id: '', encoding: '', timestamp: 0, extras: {}, data: {} }],
    ['empty client id', { clientId: '', connectionId: '', id: '', encoding: '', timestamp: 0, extras: {}, data: {} }],
  ])('invalid incoming presence messages: %s', (description: string, inbound: PresenceTestParam) => {
    const invalidPresenceTest = (context: TestContext, presenceAction: Ably.PresenceAction) => {
      const { room } = context;

      // Subscribe to typing events
      const receivedEvents: TypingEvent[] = [];
      room.typing.subscribe((event: TypingEvent) => {
        receivedEvents.push(event);
      });

      // Emulate a typing event
      context.emulateBackendPublish({
        ...inbound,
        action: presenceAction,
      } as Ably.PresenceMessage);

      // Ensure that no typing events were received
      expect(receivedEvents).toHaveLength(0);
    };

    describe.each([
      ['enter' as Ably.PresenceAction],
      ['leave' as Ably.PresenceAction],
      ['present' as Ably.PresenceAction],
      ['update' as Ably.PresenceAction],
    ])(`does not process invalid presence %s message: ${description}`, (presenceAction: Ably.PresenceAction) => {
      test<TestContext>(`does not process invalid presence ${presenceAction} message: ${description}`, (context) => {
        invalidPresenceTest(context, presenceAction);
      });
    });
  });

  it<TestContext>('has an attachment error code', (context) => {
    expect((context.room.typing as DefaultTyping).attachmentErrorCode).toBe(102005);
  });

  it<TestContext>('has a detachment error code', (context) => {
    expect((context.room.typing as DefaultTyping).detachmentErrorCode).toBe(102054);
  });
});
