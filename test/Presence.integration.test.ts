// Import necessary modules and dependencies
import * as Ably from 'ably';
import { PresenceAction, Realtime } from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { PresenceEvents } from '../src/events.js';
import { PresenceData, PresenceEvent } from '../src/Presence.js';
import { Room } from '../src/Room.js';
import { DefaultRooms, Rooms } from '../src/Rooms.js';
import { randomRoomId } from './helper/identifier.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';

// Define the test context interface
interface TestContext {
  realtime: Ably.Realtime;
  defaultTestClientId: string;
  chatRoom: Room;
  chat: Rooms;
}

describe('UserPresence', { timeout: 10000 }, () => {
  // Setup before each test, create a new Ably Realtime client and a new Room
  beforeEach<TestContext>(async (context) => {
    context.realtime = ablyRealtimeClient();
    const roomId = randomRoomId();
    context.chat = new DefaultRooms(context.realtime);
    context.defaultTestClientId = context.realtime.auth.clientId;
    context.chatRoom = context.chat.get(roomId);
  });

  // Helper function to wait for an event and run an expectation function on the received message
  async function waitForEvent(
    realtimeClient: Realtime,
    event: PresenceAction | PresenceAction[],
    realtimeChannelName: string,
    expectationFn: (member: any) => void,
  ) {
    return new Promise<void>((resolve) => {
      const presence = realtimeClient.channels.get(realtimeChannelName).presence;
      presence.subscribe(event, (member) => {
        expectationFn(member);
        resolve();
      });
    });
  }

  // Test for successful entering with clientId and custom user data
  it<TestContext>('successfully enter presence with clientId and custom user data', async (context) => {
    const enterEventPromise = waitForEvent(
      context.realtime,
      'enter',
      context.chatRoom.messages.realtimeChannelName,
      (member) => {
        expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(
          context.defaultTestClientId,
        );
        expect(member.data, 'data should be equal to supplied userCustomData').toEqual(
          '{"userCustomData":{"customKeyOne":1}}',
        );
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
      context.chatRoom.messages.realtimeChannelName,
      (member) => {
        expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(
          context.defaultTestClientId,
        );
        expect(member.data, 'data should be equal to supplied userCustomData').toEqual(
          '{"userCustomData":{"customKeyOne":1}}',
        );
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
      context.chatRoom.messages.realtimeChannelName,
      (member) => {
        expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(
          context.defaultTestClientId,
        );
        expect(member.data, 'data should be equal to supplied userCustomData').toEqual(
          '{"userCustomData":{"customKeyOne":1}}',
        );
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
    const client1 = ablyRealtimeClient({ clientId: 'clientId1' }).channels.get(
      context.chatRoom.messages.realtimeChannelName,
    );
    const client2 = ablyRealtimeClient({ clientId: 'clientId2' }).channels.get(
      context.chatRoom.messages.realtimeChannelName,
    );
    const client3 = ablyRealtimeClient({ clientId: 'clientId3' }).channels.get(
      context.chatRoom.messages.realtimeChannelName,
    );

    // Data payload to check if the custom data is fetched correctly
    const testData: PresenceData = {
      userCustomData: { customKeyOne: 1 },
    };

    // Enter presence for each client
    await client1.presence.enterClient('clientId1');
    await client2.presence.enterClient('clientId2', JSON.stringify(testData));
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
    let presenceEvent: PresenceEvent;
    const enterEventPromise = new Promise<void>((resolve) => {
      context.chatRoom.presence.subscribe(PresenceEvents.enter, (member) => {
        presenceEvent = member;
        resolve();
      });
    });
    // Enter presence to trigger the enter event
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    // Wait for the enter event to be received
    await enterEventPromise;
    expect(presenceEvent.clientId, 'client id should be equal to defaultTestClientId').toEqual(
      context.defaultTestClientId,
    );
    expect(presenceEvent.data, 'data should be equal to supplied userCustomData').toEqual({ customKeyOne: 1 });
  });

  it<TestContext>('should successfully subscribe to update events ', async (context) => {
    // Subscribe to update events
    let presenceEvent: PresenceEvent;
    const updateEventPromise = new Promise<void>((resolve) => {
      context.chatRoom.presence.subscribe(PresenceEvents.update, (member) => {
        presenceEvent = member;
        resolve();
      });
    });
    // Enter presence and update presence to trigger the update event
    await context.chatRoom.presence.enter();
    await context.chatRoom.presence.update({ customKeyOne: 1 });
    // Wait for the update event to be received
    await updateEventPromise;
    expect(presenceEvent.data, 'data should be equal to supplied userCustomData').toEqual({ customKeyOne: 1 });
    expect(presenceEvent.clientId, 'client id should be equal to defaultTestClientId').toEqual(
      context.defaultTestClientId,
    );
  });

  it<TestContext>('should successfully subscribe to leave events ', async (context) => {
    // Subscribe to leave events
    let presenceEvent: PresenceEvent;
    const leaveEventPromise = new Promise<void>((resolve) => {
      context.chatRoom.presence.subscribe(PresenceEvents.leave, (member) => {
        presenceEvent = member;
        resolve();
      });
    });
    // Enter presence and leave presence to trigger the leave event
    await context.chatRoom.presence.enter();
    await context.chatRoom.presence.leave({ customKeyOne: 1 });
    // Wait for the leave event to be received
    await leaveEventPromise;
    expect(presenceEvent.clientId, 'client id should be equal to defaultTestClientId').toEqual(
      context.defaultTestClientId,
    );
    expect(presenceEvent.data, 'data should be equal to supplied userCustomData').toEqual({ customKeyOne: 1 });
  });
});
