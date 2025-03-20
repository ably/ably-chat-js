// Import necessary modules and dependencies
import * as Ably from 'ably';
import { dequal } from 'dequal';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.ts';
import { TypingEvent, TypingEvents } from '../../src/core/events.ts';
import { Room } from '../../src/core/room.ts';
import { AllFeaturesEnabled } from '../../src/core/room-options.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { DefaultRooms, Rooms } from '../../src/core/rooms.ts';
import { waitForArrayLength } from '../helper/common.ts';
import { randomClientId, randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { waitForRoomStatus } from '../helper/room.ts';

const TEST_TIMEOUT = 10000;

// Define the test context interface
interface TestContext {
  realtime: Ably.Realtime;
  clientId: string;
  chatRoom: Room;
  chat: Rooms;
}

// Wait for a typing event matching the expected event to be received
const waitForTypingEvent = async (events: TypingEvent[], expected: TypingEvent) => {
  await vi.waitFor(
    () => {
      expect(events.some((event) => dequal(event, expected))).toBe(true);
    },
    { timeout: 3000, interval: 100 },
  );
};

describe('Typing', () => {
  // Setup before each test, create a new Ably Realtime client and a new Room
  beforeEach<TestContext>(async (context) => {
    context.realtime = ablyRealtimeClient();
    context.chat = new DefaultRooms(context.realtime, normalizeClientOptions({}), makeTestLogger());
    context.clientId = context.realtime.auth.clientId;
    context.chatRoom = await context.chat.get(randomRoomId(), {
      typing: { heartbeatThrottleMs: 600 },
    });
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
      await context.chatRoom.typing.keystroke();
      // Once the timeout timer expires, the typingStopped event should be emitted
      await waitForArrayLength(events, 2);
      // Should have received a typingStarted and then typingStopped event
      expect(events[0]?.currentlyTyping, 'clientId should be typing').toEqual(new Set([context.clientId]));
      // Wait for the typing timeout to expire and the stop typing event to be received
      expect(events[1]?.currentlyTyping, 'clientId should no longer be typing').toEqual(new Set());
    },
    TEST_TIMEOUT,
  );

  it<TestContext>(
    'subscribes to all typing events, sent by keystroke and stop',
    async (context) => {
      const events: TypingEvent[] = [];
      context.chatRoom.typing.subscribe((event) => {
        events.push(event);
      });

      await context.chatRoom.attach();

      // Send typing events
      await context.chatRoom.typing.keystroke();
      await waitForArrayLength(events, 1);
      expect(events.length).toEqual(1);
      expect(events[0]?.currentlyTyping).toEqual(new Set([context.clientId]));

      await context.chatRoom.typing.stop();
      await waitForArrayLength(events, 2);
      expect(events.length).toEqual(2);
      expect(events[1]?.currentlyTyping).toEqual(new Set());
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
        normalizeClientOptions({}),
        makeTestLogger(),
      );
      const clientId2 = randomClientId();
      const client2 = new DefaultRooms(
        ablyRealtimeClient({ clientId: clientId2 }),
        normalizeClientOptions({}),
        makeTestLogger(),
      );

      const roomOptions = { typing: { heartbeatThrottleMs: 10000 } };

      const client1Room = await client1.get(context.chatRoom.roomId, roomOptions);
      const client2Room = await client2.get(context.chatRoom.roomId, roomOptions);

      // Attach the rooms
      await context.chatRoom.attach();
      await client1Room.attach();
      await client2Room.attach();

      // send typing event for client1 and client2
      await client1Room.typing.keystroke();
      await client2Room.typing.keystroke();
      // Wait for the typing events to be received
      await waitForTypingEvent(events, {
        currentlyTyping: new Set([clientId1]),
        change: { clientId: clientId1, type: TypingEvents.Start },
      });
      await waitForTypingEvent(events, {
        currentlyTyping: new Set([clientId1, clientId2]),
        change: { clientId: clientId2, type: TypingEvents.Start },
      });
      // Get the currently typing client ids
      const currentlyTypingClientIds = context.chatRoom.typing.get();
      // Ensure that the client ids are correct
      expect(currentlyTypingClientIds.has(clientId2), 'client2 should be typing').toEqual(true);
      expect(currentlyTypingClientIds.has(clientId1), 'client1 should be typing').toEqual(true);

      events = [];
      // Try stopping typing for one of the clients
      await client1Room.typing.stop();
      // Wait for the typing events to be received
      await waitForTypingEvent(events, {
        currentlyTyping: new Set([clientId2]),
        change: { clientId: clientId1, type: TypingEvents.Stop },
      });
      // Get the currently typing client ids
      const currentlyTypingClientIdsAfterStop = context.chatRoom.typing.get();
      // Ensure that the client ids are correct and client1 is no longer typing
      expect(currentlyTypingClientIdsAfterStop.has(clientId2), 'client2 should be typing').toEqual(true);
      expect(currentlyTypingClientIdsAfterStop.has(clientId1), 'client1 should not be typing').toEqual(false);

      // stop typing 2, clears typing timeout
      await client2Room.typing.stop();
    },
    TEST_TIMEOUT,
  );

  it<TestContext>('handles discontinuities', async (context) => {
    const { chat } = context;

    const room = await chat.get(randomRoomId(), { typing: AllFeaturesEnabled.typing });

    // Attach the room
    await room.attach();

    await waitForRoomStatus(room, RoomStatus.Attached);

    // Subscribe discontinuity events
    const discontinuityErrors: (Ably.ErrorInfo | undefined)[] = [];
    const { off } = room.typing.onDiscontinuity((error: Ably.ErrorInfo | undefined) => {
      discontinuityErrors.push(error);
    });

    const channelSuspendable = room.typing.channel as Ably.RealtimeChannel & {
      notifyState(state: 'suspended' | 'attached'): void;
    };

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room, RoomStatus.Suspended);

    // Force the channel back into attached state - to simulate recovery
    channelSuspendable.notifyState('attached');

    // Wait for the room to go into attached
    await waitForRoomStatus(room, RoomStatus.Attached);

    // Wait for a discontinuity event to be received
    expect(discontinuityErrors.length).toBe(1);

    // Unsubscribe from discontinuity events
    off();

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room, RoomStatus.Suspended);

    // We shouldn't get any more discontinuity events
    expect(discontinuityErrors.length).toBe(1);

    // Calling off again should be a no-op
    off();
  });
});
