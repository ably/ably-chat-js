import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { ChatApi } from '../../src/core/chat-api.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { DefaultTyping, TypingEvent } from '../../src/core/typing.ts';
import { ChannelEventEmitterReturnType, channelPresenceEventEmitter } from '../helper/channel.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chat: ChatClient;
  chatApi: ChatApi;
  room: Room;
  emulateBackendPublish: ChannelEventEmitterReturnType<Partial<Ably.PresenceMessage>>;
}

const TEST_TYPING_TIMEOUT_MS = 100;

vi.mock('ably');

function presenceGetResponse(clientIds: Iterable<string>): Ably.PresenceMessage[] {
  const res: Ably.PresenceMessage[] = [];
  for (const clientId of clientIds) {
    res.push({
      clientId: clientId,
      action: 'present',
      timestamp: Date.now(),
      connectionId: 'connection_' + clientId,
      data: undefined,
      encoding: '',
      extras: undefined,
      id: 'some_id_' + clientId,
    });
  }
  return res;
}

// Wait for the messages to be received
const waitForMessages = (messages: TypingEvent[], expectedCount: number, timeout?: number) => {
  if (timeout === undefined) {
    timeout = 3000;
  }
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (messages.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for messages'));
    }, timeout);
  });
};

describe('Typing', () => {
  beforeEach<TestContext>(async (context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom(context);
    const channel = await context.room.typing.channel;
    context.emulateBackendPublish = channelPresenceEventEmitter(channel);
  });

  it<TestContext>('delays stop timeout while still typing', async (context) => {
    const { room } = context;
    // If stop is called, the test should fail as the timer should not have expired
    vi.spyOn(room.typing, 'stop').mockImplementation(async (): Promise<void> => {});
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
    const presence = realtime.channels.get((await room.typing.channel).name).presence;

    // If stop is called, it should call leaveClient
    vi.spyOn(presence, 'leaveClient').mockImplementation(async (): Promise<void> => {});

    // Start typing and then immediately stop typing
    await room.typing.start();
    await room.typing.stop();

    // The timer should be stopped and so waiting beyond timeout should not trigger stop again
    await new Promise((resolve) => setTimeout(resolve, TEST_TYPING_TIMEOUT_MS * 2));

    // Ensure that leaveClient was called only once by the stop method and not again when the timer expires
    expect(presence.leaveClient).toHaveBeenCalledOnce();
  });

  it<TestContext>('allows listeners to be unsubscribed', async (context) => {
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

    const channel = await context.room.typing.channel;

    let arrayToReturn = presenceGetResponse(['otherClient']);

    vi.spyOn(channel.presence, 'get').mockImplementation(() => {
      return Promise.resolve<Ably.PresenceMessage[]>(arrayToReturn);
    });

    // Emulate a typing event
    context.emulateBackendPublish({
      clientId: 'otherClient',
      action: 'enter',
    });

    await waitForMessages(receivedEvents, 1);
    expect(channel.presence.get).toBeCalledTimes(1);

    // Ensure that the listener received the event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      currentlyTyping: new Set(['otherClient']),
    });

    // Unsubscribe the listener
    unsubscribe();

    // set presence.get() to return anotherClient too
    arrayToReturn = presenceGetResponse(['otherClient', 'anotherClient']);

    // Emulate another typing event for anotherClient
    context.emulateBackendPublish({
      clientId: 'anotherClient',
      action: 'enter',
    });

    // wait for check events to be length 2 to make sure second event was triggered
    await waitForMessages(allEvents, 2);
    expect(channel.presence.get).toBeCalledTimes(2);
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
    const receivedEvents: TypingEvent[] = [];
    const { unsubscribe } = room.typing.subscribe((event: TypingEvent) => {
      receivedEvents.push(event);
    });

    // Add another
    const receivedEvents2: TypingEvent[] = [];
    const { unsubscribe: unsubscribe2 } = room.typing.subscribe((event: TypingEvent) => {
      receivedEvents2.push(event);
    });

    const channel = await context.room.typing.channel;
    let arrayToReturn = presenceGetResponse(['otherClient']);
    vi.spyOn(channel.presence, 'get').mockImplementation(() => {
      return Promise.resolve<Ably.PresenceMessage[]>(arrayToReturn);
    });

    // Emulate a typing event
    context.emulateBackendPublish({
      clientId: 'otherClient',
      action: 'enter',
    });

    await waitForMessages(receivedEvents, 1);
    expect(channel.presence.get).toBeCalledTimes(1);

    // Ensure that the listener received the event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      currentlyTyping: new Set(['otherClient']),
    });

    await waitForMessages(receivedEvents2, 1);
    // Ensure that the second listener received the event
    expect(receivedEvents2).toHaveLength(1);
    expect(receivedEvents2[0]).toEqual({
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
    arrayToReturn = presenceGetResponse(['otherClient', 'anotherClient2']);
    context.emulateBackendPublish({
      clientId: 'anotherClient2',
      action: 'enter',
    });
    await waitForMessages(checkEvents, 1);
    expect(channel.presence.get).toBeCalledTimes(2);
    expect(checkEvents[0]?.currentlyTyping).toEqual(new Set(['otherClient', 'anotherClient2']));

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

  it<TestContext>('should not emit the same typing set twice', async (context) => {
    const { room } = context;
    const channel = await context.room.typing.channel;

    // Add a listener
    const events: TypingEvent[] = [];
    const { unsubscribe } = room.typing.subscribe((event: TypingEvent) => {
      events.push(event);
    });

    const returnSet = new Set<string>();
    vi.spyOn(channel.presence, 'get').mockImplementation(() => {
      return Promise.resolve<Ably.PresenceMessage[]>(presenceGetResponse(returnSet));
    });

    let calledTimes = 0;
    const simulateEnter = (clientId: string) => {
      context.emulateBackendPublish({
        clientId: clientId,
        action: 'enter',
      });
      calledTimes++;
    };

    returnSet.add('client1');
    simulateEnter('client1');
    await waitForMessages(events, 1); // must be one event here

    // these aren't faked in the presence.get() so should not trigger an event but only a call to presence.get
    simulateEnter('client2');
    simulateEnter('client3');

    // add client4 and previously triggered client2 and client3
    returnSet.add('client2');
    returnSet.add('client3');
    returnSet.add('client4');

    simulateEnter('client4');
    await waitForMessages(events, 2); // expecting only two events
    expect(channel.presence.get).toBeCalledTimes(calledTimes);
    expect(events).toHaveLength(2);
    expect(events[0]?.currentlyTyping).toEqual(new Set(['client1'])); // first event unchanged
    expect(events[1]?.currentlyTyping).toEqual(new Set(['client1', 'client2', 'client3', 'client4'])); // second event has all clients

    await new Promise((resolve) => setTimeout(resolve, 500)); // make sure there won't be more messages
    expect(events).toHaveLength(2);

    unsubscribe();
  });

  it<TestContext>('should retry on failure', async (context) => {
    const { room } = context;
    const channel = await context.room.typing.channel;

    // Add a listener
    const events: TypingEvent[] = [];
    room.typing.subscribe((event: TypingEvent) => {
      events.push(event);
    });

    let callNum = 0;
    vi.spyOn(channel.presence, 'get').mockImplementation(() => {
      callNum++;
      if (callNum === 1) {
        return Promise.reject<Ably.PresenceMessage[]>(new Error('faked error'));
      } else {
        return Promise.resolve<Ably.PresenceMessage[]>(presenceGetResponse(['client1']));
      }
    });

    context.emulateBackendPublish({
      clientId: 'client1',
      action: 'enter',
    });

    await waitForMessages(events, 1, 4000); // must be one event here but extra wait time for the retry
    expect(channel.presence.get).toBeCalledTimes(2); // second call for the retry
    expect(events).toHaveLength(1);
    expect(events[0]?.currentlyTyping).toEqual(new Set(['client1']));
  });

  it<TestContext>('should not return stale responses even if they resolve out of order', async (context) => {
    const { room } = context;
    const channel = await context.room.typing.channel;

    // Add a listener
    const events: TypingEvent[] = [];
    room.typing.subscribe((event: TypingEvent) => {
      events.push(event);
    });

    let stopWaiting: () => void;
    const waitForThis = new Promise<void>((accept) => {
      stopWaiting = accept;
    });

    let callNum = 0;
    vi.spyOn(channel.presence, 'get').mockImplementation(() => {
      callNum++;
      if (callNum === 1) {
        return new Promise((accept) => {
          setTimeout(() => {
            accept(presenceGetResponse(['client1']));
            setTimeout(stopWaiting, 500); // delay stopWaiting to give a chance for any messages that might happen
          }, 500);
        });
      } else {
        return new Promise((accept) => {
          setTimeout(() => {
            accept(presenceGetResponse(['client1', 'client2']));
          }, 100);
        });
      }
    });

    context.emulateBackendPublish({
      clientId: 'client1',
      action: 'enter',
    });

    context.emulateBackendPublish({
      clientId: 'client2',
      action: 'enter',
    });

    await waitForThis; // at this point we should have exactly one message
    expect(channel.presence.get).toBeCalledTimes(2);
    expect(events).toHaveLength(1);
    expect(events[0]?.currentlyTyping).toEqual(new Set(['client1', 'client2']));
  });
});
