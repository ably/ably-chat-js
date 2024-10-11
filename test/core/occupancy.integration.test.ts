import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { OccupancyEvent } from '../../src/core/occupancy.ts';
import { Room } from '../../src/core/room.ts';
import { RoomLifecycle } from '../../src/core/room-status.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForExpectedInbandOccupancy } from '../helper/common.ts';
import { ablyRealtimeClientWithToken } from '../helper/realtime-client.ts';
import { getRandomRoom, waitForRoomStatus } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

const TEST_TIMEOUT = 20000;

// Wait for the occupancy of a room to reach the expected occupancy or higher
const waitForOccupancyIncrease = (room: Room, expectedChange: OccupancyEvent, last: OccupancyEvent) => {
  return new Promise<OccupancyEvent>((resolve, reject) => {
    const interval = setInterval(() => {
      room.occupancy
        .get()
        .then((occupancy) => {
          console.log('increase occupancy', occupancy, 'last', last);
          if (
            occupancy.connections - last.connections >= expectedChange.connections &&
            occupancy.presenceMembers - last.presenceMembers >= expectedChange.presenceMembers
          ) {
            clearInterval(interval);
            resolve(occupancy);
          }
        })
        .catch((error: unknown) => {
          clearInterval(interval);
          reject(error as Error);
        });
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for occupancy'));
    }, TEST_TIMEOUT);
  });
};

// Wait for the occupancy of a room to reach the expected occupancy or lower
const waitForOccupancyDecrease = (room: Room, expectedChange: OccupancyEvent, last: OccupancyEvent) => {
  return new Promise<OccupancyEvent>((resolve, reject) => {
    const interval = setInterval(() => {
      room.occupancy
        .get()
        .then((occupancy) => {
          console.log(
            'decrease occupancy',
            occupancy,
            'last',
            last,
            last.connections - occupancy.connections >= expectedChange.connections,
            last.presenceMembers - occupancy.presenceMembers >= expectedChange.presenceMembers,
          );
          if (
            last.connections - occupancy.connections >= expectedChange.connections &&
            last.presenceMembers - occupancy.presenceMembers >= expectedChange.presenceMembers
          ) {
            clearInterval(interval);
            resolve(occupancy);
          }
        })
        .catch((error: unknown) => {
          clearInterval(interval);
          reject(error as Error);
        });
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for occupancy'));
    }, TEST_TIMEOUT);
  });
};

describe('occupancy', () => {
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
  });

  it<TestContext>('should be able to get the occupancy of a chat room', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = getRandomRoom(chat);

    // Get the occupancy of the room, we start at 0
    await waitForOccupancyIncrease(
      room,
      {
        connections: 0,
        presenceMembers: 0,
      },
      {
        connections: 0,
        presenceMembers: 0,
      },
    );

    const { name: channelName } = await room.messages.channel;

    // In a separate realtime client, attach to the same room
    const realtimeClient = ablyRealtimeClientWithToken();
    const realtimeChannel = realtimeClient.channels.get(channelName);
    await realtimeChannel.attach();

    // Wait for the occupancy to reach the expected occupancy - should be 1,0 as we just have a realtime connection
    // Note that presence connections and subscribers increments as our client has permission
    // to enter presence (even if it hasn't)
    const occupancyAfterIncrease = await waitForOccupancyIncrease(
      room,
      {
        connections: 1,
        presenceMembers: 0,
      },
      {
        connections: 0,
        presenceMembers: 0,
      },
    );

    // Make another realtime client and attach to the same room, but only as a subscriber
    // Also have them enter and subscribe to presence
    const subscriberRealtimeClient = ablyRealtimeClientWithToken();
    const subscriberRealtimeChannel = subscriberRealtimeClient.channels.get(channelName, {
      modes: ['SUBSCRIBE', 'PRESENCE', 'PRESENCE_SUBSCRIBE'],
    });
    await subscriberRealtimeChannel.attach();
    await subscriberRealtimeChannel.presence.enter({ foo: 'bar' });

    // Wait for the occupancy to reach the expected occupancy
    const occupancyAfterPresence = await waitForOccupancyIncrease(
      room,
      {
        connections: 1,
        presenceMembers: 1,
      },
      occupancyAfterIncrease,
    );

    // Detach the subscriber and other realtime client and wait for the occupancy to return to the baseline 1
    await subscriberRealtimeChannel.detach();
    await realtimeChannel.detach();

    // With the realtime client detach, we end on 1,1 - due to how channel clients are cached in realtime
    await waitForOccupancyDecrease(
      room,
      {
        connections: 1,
        presenceMembers: 1,
      },
      occupancyAfterPresence,
    );
  });

  it<TestContext>('allows subscriptions to inband occupancy', { timeout: TEST_TIMEOUT }, async (context) => {
    const { chat } = context;

    const room = getRandomRoom(chat);

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
    const { name: channelName } = await room.messages.channel;
    const realtimeChannel = realtimeClient.channels.get(channelName);
    await realtimeChannel.attach();
    await realtimeChannel.presence.enter();

    // Wait for the occupancy to reach the expected occupancy
    await waitForExpectedInbandOccupancy(
      occupancyUpdates,
      {
        connections: 2,
        presenceMembers: 0,
      },
      TEST_TIMEOUT,
    );
  });

  it<TestContext>('handles discontinuities', async (context) => {
    const { chat } = context;

    const room = getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Subscribe discontinuity events
    const discontinuityErrors: (Ably.ErrorInfo | undefined)[] = [];
    const { off } = room.occupancy.onDiscontinuity((error: Ably.ErrorInfo | undefined) => {
      discontinuityErrors.push(error);
    });

    const channelSuspendable = (await room.messages.channel) as Ably.RealtimeChannel & {
      notifyState(state: 'suspended' | 'attached'): void;
    };

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomLifecycle.Suspended);

    // Force the channel back into attached state - to simulate recovery
    channelSuspendable.notifyState('attached');

    // Wait for the room to go into attached
    await waitForRoomStatus(room.status, RoomLifecycle.Attached);

    // Wait for a discontinuity event to be received
    expect(discontinuityErrors.length).toBe(1);

    // Unsubscribe from discontinuity events
    off();

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomLifecycle.Suspended);

    // We shouldn't get any more discontinuity events
    expect(discontinuityErrors.length).toBe(1);

    // Calling off again should be a no-op
    off();
  });
});
