import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatClient } from '../src/Chat.js';
import { Room } from '../src/Room.js';
import { newChatClient } from './helper/chat.js';
import { randomRoomId } from './helper/identifier.js';

interface TestContext {
  realtime: Ably.Realtime;
  chat: ChatClient;
  room: Room;
  roomId: string;
  emulateBackendPublish: Ably.messageCallback<Ably.PresenceMessage>;
  channelLevelListeners: Set<Ably.messageCallback<Ably.PresenceMessage>>;
}

const TEST_TYPING_TIMEOUT_MS = 100;

vi.mock('ably');

describe('Typing', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.roomId = randomRoomId();
    context.chat = newChatClient({ typingTimeoutMs: TEST_TYPING_TIMEOUT_MS }, context.realtime);
    context.room = context.chat.rooms.get(context.roomId);
    context.channelLevelListeners = new Set();

    const channel = context.realtime.channels.get('roomId');
    const presence = channel.presence;

    vi.spyOn(presence, 'subscribe').mockImplementation(
      // @ts-expect-error overriding mock
      async (listener: Ably.messageCallback<Ably.PresenceMessage>) => {
        context.channelLevelListeners.add(listener);

        context.emulateBackendPublish = (msg) => {
          context.channelLevelListeners.forEach((_, cb) => {
            cb(msg);
          });
        };

        return Promise.resolve();
      },
    );

    vi.spyOn(presence, 'unsubscribe').mockImplementation(
      // @ts-expect-error overriding mock
      (listener: Ably.messageCallback<Ably.PresenceMessage>) => {
        context.channelLevelListeners.delete(listener);
      },
    );

    // Mock the attach
    vi.spyOn(channel, 'attach').mockImplementation(() => Promise.resolve(null));
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

  type PresenceTestParam = Omit<Ably.PresenceMessage, 'action' | 'clientId'>;

  describe.each([
    ['no client id', { connectionId: '', id: '', encoding: '', timestamp: 0, extras: {}, data: {} }],
    ['empty client id', { clientId: '', connectionId: '', id: '', encoding: '', timestamp: 0, extras: {}, data: {} }],
  ])('invalid incoming presence messages: %s', (description: string, inbound: PresenceTestParam) => {
    const invalidPresenceTest = (context: TestContext, presenceAction: Ably.PresenceAction) =>
      new Promise<void>((done, reject) => {
        const { room } = context;

        room.typing
          .subscribe(() => {
            reject(new Error('Should not have received a typing event'));
          })
          .then(() => {
            context.emulateBackendPublish({
              ...inbound,
              action: presenceAction,
            } as Ably.PresenceMessage);
          })
          .then(() => {
            done();
          })
          .catch((err: unknown) => {
            reject(err as Error);
          });
      });

    describe.each([
      ['enter' as Ably.PresenceAction],
      ['leave' as Ably.PresenceAction],
      ['present' as Ably.PresenceAction],
      ['update' as Ably.PresenceAction],
    ])(`does not process invalid presence %s message: ${description}`, (presenceAction: Ably.PresenceAction) => {
      test<TestContext>(`does not process invalid presence ${presenceAction} message: ${description}`, (context) =>
        invalidPresenceTest(context, presenceAction));
    });
  });
});
