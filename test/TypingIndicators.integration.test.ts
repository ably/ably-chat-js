// Import necessary modules and dependencies
import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { Room } from '../src/Room.js';
import { DefaultRooms, Rooms } from '../src/Rooms.js';
import { TypingIndicatorEvent } from '../src/TypingIndicator.js';
import { randomClientId, randomRoomId } from './helper/identifier.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';

const TEST_TIMEOUT = 10000;

// Define the test context interface
interface TestContext {
  realtime: Ably.Realtime;
  clientId: string;
  roomId: string;
  chatRoom: Room;
  chat: Rooms;
}

// Wait for the messages to be received
const waitForMessages = (messages: TypingIndicatorEvent[], expectedCount: number) => {
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
describe('TypingIndicators', () => {
  // Setup before each test, create a new Ably Realtime client and a new Room
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    context.roomId = randomRoomId();
    context.chat = new DefaultRooms(context.realtime, { typingTimeoutMs: 300 });
    context.clientId = context.realtime.auth.clientId;
    context.chatRoom = context.chat.get(context.roomId);
  });

  // Test to check if the typing indicator starts and stops typing after the default timeout
  it<TestContext>(
    'successfully starts typing and then stops after the default timeout',
    async (context) => {
      let events: TypingIndicatorEvent[] = [];
      // Subscribe to typing indicators
      await context.chatRoom.typingIndicators.subscribe((event) => {
        events.push(event);
      });
      // Start typing and emit typingStarted event
      await context.chatRoom.typingIndicators.startTyping();
      // Once the timout timer expires, the typingStopped event should be emitted
      await waitForMessages(events, 2);
      // Should have received a typingStarted and then typingStopped event
      expect(events[0].change.clientId, 'client ids should match').toEqual(context.clientId);
      expect(events[0].change.isTyping, 'isTyping should be true').toEqual(true);
      // Wait for the typing timeout to expire and the stop typing event to be received
      expect(events[1].change.clientId, 'client ids should match').toEqual(context.clientId);
      expect(events[1].change.isTyping, 'isTyping should be false').toEqual(false);
    },
    TEST_TIMEOUT,
  );

  it<TestContext>(
    'subscribes to all typing indicators, sent by startTyping and stopTyping',
    async (context) => {
      let events: TypingIndicatorEvent[] = [];
      await context.chatRoom.typingIndicators.subscribe((event) => {
        events.push(event);
      });
      // Send typing indicator
      await context.chatRoom.typingIndicators.startTyping();
      await context.chatRoom.typingIndicators.stopTyping();

      // Should have received a typingStarted and typingStopped event
      expect(events.length, 'typingStopped event should have been received').toEqual(2);

      // First event should be typingStarted
      expect(events[0].currentlyTypingClientIds.has(context.clientId)).toEqual(true);
      expect(events[0].change.isTyping, 'first event should be typingStarted').toEqual(true);

      // Last event should be typingStopped
      expect(events[1].change.isTyping, 'second event should be typingStopped').toEqual(false);
      expect(events[1].currentlyTypingClientIds.has(context.clientId)).toEqual(false);
    },
    TEST_TIMEOUT,
  );
  it<TestContext>(
    'gets the set of currently typing client ids',
    async (context) => {
      let events: TypingIndicatorEvent[] = [];
      // Subscribe to typing indicators
      await context.chatRoom.typingIndicators.subscribe((event) => {
        events.push(event);
      });
      // Create new clients with new client ids
      const clientId1 = randomClientId();
      const client1 = new DefaultRooms(ablyRealtimeClient({ clientId: clientId1 }), { typingTimeoutMs: 1000 });
      const clientId2 = randomClientId();
      const client2 = new DefaultRooms(ablyRealtimeClient({ clientId: clientId2 }), { typingTimeoutMs: 1000 });

      // send typing indicator for client1 and client2
      await client1.get(context.roomId).typingIndicators.startTyping();
      await client2.get(context.roomId).typingIndicators.startTyping();
      // Wait for the typing indicators to be received
      await waitForMessages(events, 2);
      // Get the currently typing client ids
      const currentlyTypingClientIds = context.chatRoom.typingIndicators.get();
      // Ensure that the client ids are correct
      expect(currentlyTypingClientIds.has(clientId2), 'client2 should be typing').toEqual(true);
      expect(currentlyTypingClientIds.has(clientId1), 'client1 should be typing').toEqual(true);

      events = [];
      // Try stopping typing for one of the clients
      await client1.get(context.roomId).typingIndicators.stopTyping();
      // Wait for the typing indicators to be received
      await waitForMessages(events, 1);
      // Get the currently typing client ids
      const currentlyTypingClientIdsAfterStop = context.chatRoom.typingIndicators.get();
      // Ensure that the client ids are correct and client1 is no longer typing
      expect(currentlyTypingClientIdsAfterStop.has(clientId2), 'client2 should be typing').toEqual(true);
      expect(currentlyTypingClientIdsAfterStop.has(clientId1), 'client1 should not be typing').toEqual(false);
    },
    TEST_TIMEOUT,
  );
});
