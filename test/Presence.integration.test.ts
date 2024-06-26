// Import necessary modules and dependencies
import * as Ably from 'ably';
import { PresenceAction, Realtime } from 'ably';
import { dequal } from 'dequal';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../src/Chat.js';
import { PresenceEvents } from '../src/events.js';
import { PresenceData, PresenceEvent } from '../src/Presence.js';
import { Room } from '../src/Room.js';
import { newChatClient } from './helper/chat.js';
import { randomRoomId } from './helper/identifier.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';

// Define the test context interface
interface TestContext {
  realtime: Ably.Realtime;
  defaultTestClientId: string;
  chatRoom: Room;
  chat: ChatClient;
}

// Wait a maximum of 5 seconds for a particular presence event to be received
const waitForPresenceEvent = async (
  events: PresenceEvent[],
  action: PresenceEvents,
  clientId: string,
  data: unknown,
) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      for (const event of events) {
        if (event.action === action && dequal(event.data, data) && event.clientId === clientId) {
          clearInterval(interval);
          resolve();
        }
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for presence event'));
    }, 5000);
  });
};

describe('UserPresence', { timeout: 10000 }, () => {
  // Setup before each test, create a new Ably Realtime client and a new Room
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const roomId = randomRoomId();
    context.chat = newChatClient(undefined, context.realtime);
    context.defaultTestClientId = context.realtime.auth.clientId;
    context.chatRoom = context.chat.rooms.get(roomId);
  });

  // Helper function to wait for an event and run an expectation function on the received message
  async function waitForEvent(
    realtimeClient: Realtime,
    event: PresenceAction | PresenceAction[],
    realtimeChannelName: string,
    expectationFn: (member: Ably.PresenceMessage) => void,
  ) {
    return new Promise<void>((resolve, reject) => {
      const presence = realtimeClient.channels.get(realtimeChannelName).presence;
      presence
        .subscribe(event, (member) => {
          expectationFn(member);
          resolve();
        })
        .catch((err: unknown) => {
          reject(err as Error);
        });
    });
  }

  // Test for successful entering with clientId and custom user data
  it<TestContext>('successfully enter presence with clientId and custom user data', async (context) => {
    const enterEventPromise = waitForEvent(
      context.realtime,
      'enter',
      context.chatRoom.messages.channel.name,
      (member: Ably.PresenceMessage) => {
        expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(
          context.defaultTestClientId,
        );
        expect(member.data, 'data should be equal to supplied userCustomData').toEqual({
          userCustomData: { customKeyOne: 1 },
        });
      },
    );
    // Enter with custom user data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    // Wait for the enter event to be received
    await enterEventPromise;
  });

  // Test for successful sending of presence update with clientId and custom user data
  it<TestContext>('should successfully send presence update with clientId and custom user data', async (context) => {
    const enterEventPromise = waitForEvent(
      context.realtime,
      'update',
      context.chatRoom.messages.channel.name,
      (member) => {
        expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(
          context.defaultTestClientId,
        );
        expect(member.data, 'data should be equal to supplied userCustomData').toEqual({
          userCustomData: { customKeyOne: 1 },
        });
      },
    );
    // Enter with custom user data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    // Send presence update with custom user data
    await context.chatRoom.presence.update({ customKeyOne: 1 });
    // Wait for the update event to be received
    await enterEventPromise;
  });

  // Test for successful leaving of presence
  it<TestContext>('should successfully leave presence', async (context) => {
    const enterEventPromise = waitForEvent(
      context.realtime,
      'leave',
      context.chatRoom.messages.channel.name,
      (member: Ably.PresenceMessage) => {
        expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(
          context.defaultTestClientId,
        );
        expect(member.data, 'data should be equal to supplied userCustomData').toEqual({
          userCustomData: { customKeyOne: 1 },
        });
      },
    );
    // Enter with custom user data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    // Leave with custom user data
    await context.chatRoom.presence.leave({ customKeyOne: 1 });
    // Wait for the leave event to be received
    await enterEventPromise;
  });

  // Test for successful fetching of presence users
  it<TestContext>('should successfully fetch presence users ', async (context) => {
    // Connect 3 clients to the same channel
    const client1 = ablyRealtimeClient({ clientId: 'clientId1' }).channels.get(context.chatRoom.messages.channel.name);
    const client2 = ablyRealtimeClient({ clientId: 'clientId2' }).channels.get(context.chatRoom.messages.channel.name);
    const client3 = ablyRealtimeClient({ clientId: 'clientId3' }).channels.get(context.chatRoom.messages.channel.name);

    // Data payload to check if the custom data is fetched correctly
    const testData: PresenceData = {
      userCustomData: { customKeyOne: 1 },
    };

    // Enter presence for each client
    await client1.presence.enterClient('clientId1');
    await client2.presence.enterClient('clientId2', testData);
    await client3.presence.enterClient('clientId3');

    // Check if all clients are present
    const fetchedPresence = await context.chatRoom.presence.get();
    // Expect statements
    expect(fetchedPresence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientId: 'clientId1',
          action: 'present',
          data: undefined,
        }),
        expect.objectContaining({
          clientId: 'clientId2',
          action: 'present',
          data: { customKeyOne: 1 },
        }),
        expect.objectContaining({
          clientId: 'clientId3',
          action: 'present',
          data: undefined,
        }),
      ]),
    );

    // Check if clients leaves presence, the clients are no longer present in the fetched list.
    await client1.presence.leave();
    await client2.presence.leave();
    const fetchedPresenceAfterLeave = await context.chatRoom.presence.get();
    expect(fetchedPresenceAfterLeave, 'fetched presence should not contain clientId3').not.toEqual(
      expect.arrayContaining([{ clientId: 'clientId3', status: 'present' }]),
    );
  });

  it<TestContext>('should successfully fetch a single presence user ', async (context) => {
    // Enter presence for a client
    await context.chatRoom.presence.enter();
    // Fetch the presence list and check if the client is present
    const userIsPresent = await context.chatRoom.presence.userIsPresent(context.defaultTestClientId);
    expect(userIsPresent, 'user with clientId should be present').toEqual(true);
    // Ensure that a user that has not entered presence is not present
    const userIsNotPresent = await context.chatRoom.presence.userIsPresent('clientId2');
    expect(userIsNotPresent, 'user with clientId1 should not be present').toEqual(false);
  });

  // Test for successful subscription to enter events
  it<TestContext>('should successfully subscribe to enter events ', async (context) => {
    // Subscribe to enter events
    const presenceEvents: PresenceEvent[] = [];
    await context.chatRoom.presence.subscribe(PresenceEvents.enter, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event
    await context.chatRoom.presence.enter({ customKeyOne: 1 });

    // Wait for the enter event to be received
    await waitForPresenceEvent(presenceEvents, PresenceEvents.enter, context.chat.clientId, { customKeyOne: 1 });
  });

  it<TestContext>('should successfully subscribe to update events ', async (context) => {
    // Subscribe to update events
    const presenceEvents: PresenceEvent[] = [];
    await context.chatRoom.presence.subscribe(PresenceEvents.update, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event and then update our data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    await context.chatRoom.presence.update({ customKeyOne: 2 });

    // Wait for the update event to be received
    await waitForPresenceEvent(presenceEvents, PresenceEvents.update, context.chat.clientId, { customKeyOne: 2 });
  });

  it<TestContext>('should successfully subscribe to leave events ', async (context) => {
    // Subscribe to leave events
    const presenceEvents: PresenceEvent[] = [];
    await context.chatRoom.presence.subscribe(PresenceEvents.leave, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event and then update our data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    await context.chatRoom.presence.leave({ customKeyOne: 3 });

    // Wait for the update event to be received
    await waitForPresenceEvent(presenceEvents, PresenceEvents.leave, context.chat.clientId, { customKeyOne: 3 });
  });
  it<TestContext>('should successfully handle multiple data types', async (context) => {
    // Subscribe to leave events
    const presenceEvents: PresenceEvent[] = [];
    await context.chatRoom.presence.subscribe((event) => {
      presenceEvents.push(event);
    });
    // Enter presence to trigger the enter event with undefined data
    await context.chatRoom.presence.enter();
    await waitForPresenceEvent(presenceEvents, PresenceEvents.enter, context.chat.clientId, undefined);
    // Update with string
    await context.chatRoom.presence.update('string');
    await waitForPresenceEvent(presenceEvents, PresenceEvents.update, context.chat.clientId, 'string');
    // Update with number
    await context.chatRoom.presence.update(1);
    await waitForPresenceEvent(presenceEvents, PresenceEvents.update, context.chat.clientId, 1);
    // Update with boolean
    await context.chatRoom.presence.update(true);
    await waitForPresenceEvent(presenceEvents, PresenceEvents.update, context.chat.clientId, true);
    // Update with object
    await context.chatRoom.presence.update({ key: 'value' });
    await waitForPresenceEvent(presenceEvents, PresenceEvents.update, context.chat.clientId, { key: 'value' });
  });
});
