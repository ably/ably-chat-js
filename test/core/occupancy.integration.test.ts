import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { OccupancyEvent } from '../../src/core/occupancy.ts';
import { Room } from '../../src/core/room.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForExpectedInbandOccupancy } from '../helper/common.ts';
import { ablyRealtimeClientWithToken } from '../helper/realtime-client.ts';
import { getRandomRoom } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

const TEST_TIMEOUT = 30000;

// Wait for the occupancy of a room to reach the expected occupancy.
// Do this with a 10s timeout.
const waitForExpectedInstantaneousOccupancy = async (room: Room, expectedOccupancy: OccupancyEvent) => {
  await vi.waitFor(
    async () => {
      const occupancy = await room.occupancy.get();
      expect(occupancy.connections).toBe(expectedOccupancy.connections);
      expect(occupancy.presenceMembers).toBe(expectedOccupancy.presenceMembers);
    },
    { timeout: TEST_TIMEOUT, interval: 1000 },
  );
};

describe('occupancy', () => {
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
  });

  it<TestContext>('should be able to get the occupancy of a chat room', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Get the occupancy of the room, instantaneously it will be 0
    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 0,
      presenceMembers: 0,
    });

    const { name: channelName } = room.channel;

    // In a separate realtime client, attach to the same room
    const realtimeClient = ablyRealtimeClientWithToken();
    const realtimeChannel = realtimeClient.channels.get(channelName);
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
    const subscriberRealtimeChannel = subscriberRealtimeClient.channels.get(channelName, {
      modes: ['SUBSCRIBE', 'PRESENCE', 'PRESENCE_SUBSCRIBE'],
    });
    await subscriberRealtimeChannel.attach();
    await subscriberRealtimeChannel.presence.enter({ foo: 'bar' });

    // Wait for the occupancy to reach the expected occupancy
    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 2,
      presenceMembers: 1,
    });

    // Explicitly leave presence
    await subscriberRealtimeChannel.presence.leave();

    // Detach the subscriber and other realtime client
    await subscriberRealtimeChannel.detach();
    await realtimeChannel.detach();

    // Everything should be back to 0
    await waitForExpectedInstantaneousOccupancy(room, {
      connections: 0,
      presenceMembers: 0,
    });
  });

  it<TestContext>('allows subscriptions to inband occupancy', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat, { occupancy: { enableEvents: true } });

    // Subscribe to occupancy
    const occupancyUpdates: OccupancyEvent[] = [];
    room.occupancy.subscribe((occupancy) => {
      occupancyUpdates.push(occupancy);
    });

    // Attach room
    await room.attach();

    // Wait to get our first occupancy update - us entering the room
    await waitForExpectedInbandOccupancy(
      occupancyUpdates,
      {
        connections: 1,
        presenceMembers: 0,
      },
      TEST_TIMEOUT,
    );

    // In a separate realtime client, attach to the same room
    const realtimeClient = ablyRealtimeClientWithToken();
    const { name: channelName } = room.channel;
    const realtimeChannel = realtimeClient.channels.get(channelName);
    await realtimeChannel.attach();
    await realtimeChannel.presence.enter();

    // Wait for the occupancy to reach the expected occupancy
    await waitForExpectedInbandOccupancy(
      occupancyUpdates,
      {
        connections: 2,
        presenceMembers: 1,
      },
      TEST_TIMEOUT,
    );
  });
});
