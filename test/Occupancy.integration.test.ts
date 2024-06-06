import { beforeEach, describe, it } from 'vitest';
import { ablyRealtimeClientWithToken } from './helper/realtimeClient.ts';
import { ChatClient } from '../src/Chat.ts';
import { randomRoomId } from './helper/identifier.ts';
import { Room } from '../src/Room.ts';
import { OccupancyEvent } from '../src/Occupancy.ts';

interface TestContext {
  chat: ChatClient;
}

const TEST_TIMEOUT = 20000;

// Wait for the occupancy of a room to reach the expected occupancy.
// Do this with a 10s timeout.
const waitForExpectedInstantaneousOccupancy = (room: Room, expectedOccupancy: OccupancyEvent) => {
  return new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      const occupancy = await room.occupancy.get();
      if (
        occupancy.connections === expectedOccupancy.connections &&
        occupancy.presenceMembers === expectedOccupancy.presenceMembers
      ) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, TEST_TIMEOUT);
  });
};

// Wait to receive an occupancy event that matches the expected occupancy.
// Do this with a 10s timeout.
const waitForExpectedInbandOccupancy = (occupancyEvents: OccupancyEvent[], expectedOccupancy: OccupancyEvent) => {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const occupancy = occupancyEvents.find(
        (occupancy) =>
          occupancy.connections === expectedOccupancy.connections &&
          occupancy.presenceMembers === expectedOccupancy.presenceMembers,
      );

      if (occupancy) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, TEST_TIMEOUT);
  });
};

describe('occupancy', () => {
  beforeEach<TestContext>((context) => {
    context.chat = new ChatClient(ablyRealtimeClientWithToken());
  });

  it<TestContext>('should be able to get the occupancy of a chat room', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Get the occupancy of the room
    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 0,
      presenceMembers: 0,
    });

    // In a separate realtime client, attach to the same room
    const realtimeClient = ablyRealtimeClientWithToken();
    const realtimeChannel = realtimeClient.channels.get(room.messages.channel.name);
    await realtimeChannel.attach();

    // Wait for the occupancy to reach the expected occupancy
    // Note that presence connections and subscribers increments as our client has permission
    // to enter presence (even if it hasn't)
    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 1,
      presenceMembers: 0,
    });

    // Make another realtime client and attach to the same room, but only as a subscriber
    // Also have them enter and subscribe to presence
    const subscriberRealtimeClient = ablyRealtimeClientWithToken();
    const subscriberRealtimeChannel = subscriberRealtimeClient.channels.get(room.messages.channel.name, {
      modes: ['SUBSCRIBE', 'PRESENCE', 'PRESENCE_SUBSCRIBE'],
    });
    await subscriberRealtimeChannel.attach();
    await subscriberRealtimeChannel.presence.enter({ foo: 'bar' });

    // Wait for the occupancy to reach the expected occupancy
    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 2,
      presenceMembers: 1,
    });

    // Detach the subscriber and other realtime client and wait for the occupancy to return to 0
    await subscriberRealtimeChannel.detach();
    await realtimeChannel.detach();

    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 0,
      presenceMembers: 0,
    });
  });

  it<TestContext>('allows subscriptions to inband occupancy', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Subscribe to occupancy
    const occupancyUpdates: OccupancyEvent[] = [];
    await room.occupancy.subscribe((occupancy) => {
      occupancyUpdates.push(occupancy);
    });

    // Wait to get our first occupancy update - us entering the room
    await waitForExpectedInbandOccupancy(occupancyUpdates, {
      connections: 1,
      presenceMembers: 0,
    });

    // In a separate realtime client, attach to the same room
    const realtimeClient = ablyRealtimeClientWithToken();
    const realtimeChannel = realtimeClient.channels.get(room.messages.channel.name);
    await realtimeChannel.attach();
    await realtimeChannel.presence.enter();

    // Wait for the occupancy to reach the expected occupancy
    await waitForExpectedInbandOccupancy(occupancyUpdates, {
      connections: 2,
      presenceMembers: 1,
    });
  });

  it<TestContext>('allows toggling of occupancy subscriptions', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Subscribe to occupancy
    const occupancyUpdates: OccupancyEvent[] = [];
    const listener = (occupancy: OccupancyEvent) => {
      occupancyUpdates.push(occupancy);
    };
    await room.occupancy.subscribe(listener);

    // Wait to get our first occupancy update - us entering the room
    await waitForExpectedInbandOccupancy(occupancyUpdates, {
      connections: 1,
      presenceMembers: 0,
    });

    // Now unsubscribe - this should stop occupancy updates
    await room.occupancy.unsubscribe(listener);

    // In a separate realtime client, attach to the same room
    const realtimeClient = ablyRealtimeClientWithToken();
    const realtimeChannel = realtimeClient.channels.get(room.messages.channel.name);
    await realtimeChannel.attach();

    // Now lets re-subscribe to re-enable occupancy updates
    await room.occupancy.subscribe(listener);

    // Wait for the occupancy to reach the expected occupancy
    await waitForExpectedInbandOccupancy(occupancyUpdates, {
      connections: 2,
      presenceMembers: 0,
    });
  });
});
