// Import necessary modules and dependencies
import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { normaliseClientOptions } from '../src/config.js';
import { Room } from '../src/Room.js';
import { DefaultTypingOptions } from '../src/RoomOptions.js';
import { DefaultRooms, Rooms } from '../src/Rooms.js';
import { RoomStatus } from '../src/RoomStatus.js';
import { TypingEvent } from '../src/Typing.js';
import { randomClientId, randomRoomId } from './helper/identifier.js';
import { makeTestLogger } from './helper/logger.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';
import { waitForRoomStatus } from './helper/room.js';

const TEST_TIMEOUT = 10000;

// Define the test context interface
interface TestContext {
  realtime: Ably.Realtime;
  clientId: string;
  chatRoom: Room;
  chat: Rooms;
}

// Wait for the messages to be received
const waitForMessages = (messages: TypingEvent[], expectedCount: number) => {
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
    }, 3000);
  });
};
describe('Typing', () => {
  // Setup before each test, create a new Ably Realtime client and a new Room
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    context.chat = new DefaultRooms(context.realtime, normaliseClientOptions({}), makeTestLogger());
    context.clientId = context.realtime.auth.clientId;
    context.chatRoom = context.chat.get(randomRoomId(), { typing: { timeoutMs: 300 } });
  });

  // Test to check if typing starts and then stops typing after the default timeout
  it<TestContext>(
    'successfully starts typing and then stops after the default timeout',
    async (context) => {
      const events: TypingEvent[] = [];
      // Subscribe to typing events
      context.chatRoom.typing.subscribe((event) => {
        events.push(event);
      });
      // Attach the room
      await context.chatRoom.attach();
      // Start typing and emit typingStarted event
      await context.chatRoom.typing.start();
      // Once the timout timer expires, the typingStopped event should be emitted
      await waitForMessages(events, 2);
      // Should have received a typingStarted and then typingStopped event
      expect(events[0]?.change.clientId, 'client ids should match').toEqual(context.clientId);
      expect(events[0]?.change.isTyping, 'isTyping should be true').toEqual(true);
      // Wait for the typing timeout to expire and the stop typing event to be received
      expect(events[1]?.change.clientId, 'client ids should match').toEqual(context.clientId);
      expect(events[1]?.change.isTyping, 'isTyping should be false').toEqual(false);
    },
    TEST_TIMEOUT,
  );

  it<TestContext>(
    'subscribes to all typing events, sent by start and stop',
    async (context) => {
      const events: TypingEvent[] = [];
      context.chatRoom.typing.subscribe((event) => {
        events.push(event);
      });
      // Attach the room
      await context.chatRoom.attach();
      // Send typing events
      await context.chatRoom.typing.start();
      await context.chatRoom.typing.stop();

      // Should have received a typingStarted and typingStopped event
      expect(events.length, 'typingStopped event should have been received').toEqual(2);

      // First event should be typingStarted
      expect(events[0]?.currentlyTyping.has(context.clientId)).toEqual(true);
      expect(events[0]?.change.isTyping, 'first event should be typingStarted').toEqual(true);

      // Last event should be typingStopped
      expect(events[1]?.change.isTyping, 'second event should be typingStopped').toEqual(false);
      expect(events[1]?.currentlyTyping.has(context.clientId)).toEqual(false);
    },
    TEST_TIMEOUT,
  );
  it<TestContext>(
    'gets the set of currently typing client ids',
    async (context) => {
      let events: TypingEvent[] = [];
      // Subscribe to typing events
      context.chatRoom.typing.subscribe((event) => {
        events.push(event);
      });
      // Create new clients with new client ids
      const clientId1 = randomClientId();
      const client1 = new DefaultRooms(
        ablyRealtimeClient({ clientId: clientId1 }),
        normaliseClientOptions({}),
        makeTestLogger(),
      );
      const clientId2 = randomClientId();
      const client2 = new DefaultRooms(
        ablyRealtimeClient({ clientId: clientId2 }),
        normaliseClientOptions({}),
        makeTestLogger(),
      );

      const roomOptions = { typing: { timeoutMs: 1000 } };

      // Attach the rooms
      await context.chatRoom.attach();
      await client1.get(context.chatRoom.roomId, roomOptions).attach();
      await client2.get(context.chatRoom.roomId, roomOptions).attach();

      // send typing event for client1 and client2
      await client1.get(context.chatRoom.roomId, roomOptions).typing.start();
      await client2.get(context.chatRoom.roomId, roomOptions).typing.start();
      // Wait for the typing events to be received
      await waitForMessages(events, 2);
      // Get the currently typing client ids
      const currentlyTypingClientIds = context.chatRoom.typing.get();
      // Ensure that the client ids are correct
      expect(currentlyTypingClientIds.has(clientId2), 'client2 should be typing').toEqual(true);
      expect(currentlyTypingClientIds.has(clientId1), 'client1 should be typing').toEqual(true);

      events = [];
      // Try stopping typing for one of the clients
      await client1.get(context.chatRoom.roomId, roomOptions).typing.stop();
      // Wait for the typing events to be received
      await waitForMessages(events, 1);
      // Get the currently typing client ids
      const currentlyTypingClientIdsAfterStop = context.chatRoom.typing.get();
      // Ensure that the client ids are correct and client1 is no longer typing
      expect(currentlyTypingClientIdsAfterStop.has(clientId2), 'client2 should be typing').toEqual(true);
      expect(currentlyTypingClientIdsAfterStop.has(clientId1), 'client1 should not be typing').toEqual(false);
    },
    TEST_TIMEOUT,
  );

  it<TestContext>('handles discontinuities', async (context) => {
    const { chat } = context;

    const room = chat.get(randomRoomId(), { typing: DefaultTypingOptions });

    // Attach the room
    await room.attach();

    await waitForRoomStatus(room.status, RoomStatus.Attached);

    // Subscribe discontinuity events
    const discontinuityErrors: (Ably.ErrorInfo | undefined)[] = [];
    const { off } = room.typing.onDiscontinuity((error: Ably.ErrorInfo | undefined) => {
      discontinuityErrors.push(error);
    });

    const channelSuspendable = room.typing.channel as Ably.RealtimeChannel & {
      notifyState(state: 'suspended'): void;
    };

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomStatus.Suspended);

    // Now attach the room again
    await room.attach();

    // Wait for the room to go into attached
    await waitForRoomStatus(room.status, RoomStatus.Attached);

    // Wait for a discontinuity event to be received
    expect(discontinuityErrors.length).toBe(1);

    // Unsubscribe from discontinuity events
    off();

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomStatus.Suspended);

    // We shouldn't get any more discontinuity events
    expect(discontinuityErrors.length).toBe(1);

    // Calling off again should be a no-op
    off();
  });
});
