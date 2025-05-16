// Import necessary modules and dependencies
import { PresenceMember } from '@ably/chat';
import * as Ably from 'ably';
import { PresenceAction, Realtime } from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { PresenceEventType } from '../../src/core/events.ts';
import { PresenceData, PresenceEvent } from '../../src/core/presence.ts';
import { Room } from '../../src/core/room.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForExpectedPresenceEvent } from '../helper/common.ts';
import { randomRoomName } from '../helper/identifier.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';

// Define the test context interface
interface TestContext {
  realtime: Ably.Realtime;
  defaultTestClientId: string;
  chatRoom: Room;
  chat: ChatClient;
}

// Wait a maximum of 10 seconds to assert that a presence event has not been received
const assertNoPresenceEvent = async (events: PresenceEvent[], type: PresenceEventType, clientId: string) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      for (const event of events) {
        if (event.type === type && event.member.clientId === clientId) {
          clearInterval(interval);
          reject(new Error('Presence event was received'));
        }
      }
      clearInterval(interval);
      resolve();
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 10000);
  });
};

// Helper function to wait for an event and run an expectation function on the received message
// Wait a maximum of 3 seconds for the event to be received
const waitForEvent = async (
  realtimeClient: Realtime,
  event: PresenceAction | PresenceAction[],
  realtimeChannelName: string,
  expectationFn: (member: Ably.PresenceMessage) => void,
) => {
  const presence = realtimeClient.channels.get(realtimeChannelName).presence;
  let lastMember: Ably.PresenceMessage;
  const waitFor = vi.waitFor(
    () => {
      expect(lastMember).toBeDefined();
      expectationFn(lastMember as unknown as Ably.PresenceMessage);
    },
    { timeout: 3000 },
  );

  await presence.subscribe(event, (member) => {
    lastMember = member;
  });

  return waitFor;
};

// Helper function to wait for presence list to match the expectation
// Wait a maximum of 5 seconds for the presence list to match
const waitForPresenceList = async (room: Room, expectationFn: (presenceList: PresenceMember[]) => void) => {
  return vi.waitFor(
    async () => {
      const fetchedPresence = await room.presence.get();
      expectationFn(fetchedPresence);
    },
    { timeout: 5000 },
  );
};

describe('UserPresence', { timeout: 30000 }, () => {
  // Setup before each test, create a new Ably Realtime client and a new Room
  beforeEach<TestContext>(async (context) => {
    context.realtime = ablyRealtimeClient();
    const roomName = randomRoomName();
    context.chat = newChatClient(undefined, context.realtime);
    context.defaultTestClientId = context.realtime.auth.clientId;
    context.chatRoom = await context.chat.rooms.get(roomName);

    // Attach the chat room to ensure it is ready for presence operations
    await context.chatRoom.attach();
    // Ensure we have just performed a sync so we don't get a `present` events instead of an `enter` event
    await context.chatRoom.presence.get({ waitForSync: true });
  });

  // Test for successful entering with clientId and custom user data
  it<TestContext>('successfully enter presence with clientId and custom user data', async (context) => {
    const messageChannel = context.chatRoom.channel;
    const messageChannelName = messageChannel.name;
    const enterEventPromise = waitForEvent(
      context.realtime,
      ['enter'],
      messageChannelName,
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
    const messageChannel = context.chatRoom.channel;
    const messageChannelName = messageChannel.name;
    const enterEventPromise = waitForEvent(context.realtime, 'update', messageChannelName, (member) => {
      expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(context.defaultTestClientId);
      expect(member.data, 'data should be equal to supplied userCustomData').toEqual({
        userCustomData: { customKeyOne: 1 },
      });
    });

    // Enter with custom user data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    // Send presence update with custom user data
    await context.chatRoom.presence.update({ customKeyOne: 1 });
    // Wait for the update event to be received
    await enterEventPromise;
  });

  // Test for successful leaving of presence
  it<TestContext>('should successfully leave presence', async (context) => {
    const messageChannel = context.chatRoom.channel;
    const messageChannelName = messageChannel.name;
    const enterEventPromise = waitForEvent(
      context.realtime,
      'leave',
      messageChannelName,
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
    const { name: channelName } = context.chatRoom.channel;

    // Connect 3 clients to the same channel
    const client1 = ablyRealtimeClient({ clientId: 'clientId1' }).channels.get(channelName);
    const client2 = ablyRealtimeClient({ clientId: 'clientId2' }).channels.get(channelName);
    const client3 = ablyRealtimeClient({ clientId: 'clientId3' }).channels.get(channelName);

    // Data payload to check if the custom data is fetched correctly
    const testData: PresenceData = {
      userCustomData: { customKeyOne: 1 },
    };

    // Enter presence for each client
    await client1.presence.enterClient('clientId1');
    await client2.presence.enterClient('clientId2', testData);
    await client3.presence.enterClient('clientId3');

    // Check if all clients are present, retrying for up to 5 seconds
    await waitForPresenceList(context.chatRoom, (fetchedPresence) => {
      expect(fetchedPresence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            clientId: 'clientId1',
            data: undefined,
          }),
          expect.objectContaining({
            clientId: 'clientId2',
            data: { customKeyOne: 1 },
          }),
          expect.objectContaining({
            clientId: 'clientId3',
            data: undefined,
          }),
        ]),
      );
    });

    // Check if clients leaves presence, the clients are no longer present in the fetched list.
    await client1.presence.leave();
    await client2.presence.leave();

    // Wait for up to 5 seconds for the presence list to update after clients leave
    await waitForPresenceList(context.chatRoom, (fetchedPresenceAfterLeave) => {
      expect(fetchedPresenceAfterLeave, 'fetched presence should not contain clientId3').not.toEqual(
        expect.arrayContaining([{ clientId: 'clientId3' }]),
      );
    });
  });

  it<TestContext>('should successfully fetch a single presence user ', async (context) => {
    // Enter presence for a client
    await context.chatRoom.presence.enter();
    // Fetch the presence list and check if the client is present
    const userIsPresent = await context.chatRoom.presence.isUserPresent(context.defaultTestClientId);
    expect(userIsPresent, 'user with clientId should be present').toEqual(true);
    // Ensure that a user that has not entered presence is not present
    const userIsNotPresent = await context.chatRoom.presence.isUserPresent('clientId2');
    expect(userIsNotPresent, 'user with clientId1 should not be present').toEqual(false);
  });

  // Test for successful subscription to enter events
  it<TestContext>('should successfully subscribe to enter events ', async (context) => {
    // Subscribe to enter events
    const presenceEvents: PresenceEvent[] = [];
    context.chatRoom.presence.subscribe(PresenceEventType.Enter, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event
    await context.chatRoom.presence.enter({ customKeyOne: 1 });

    // Wait for the enter event to be received
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Enter, data: { customKeyOne: 1 } },
      presenceEvents,
    );
  });

  it<TestContext>('does not send unrelated presence events', async (context) => {
    // Subscribe to enter events
    const presenceEvents: PresenceEvent[] = [];
    const { unsubscribe } = context.chatRoom.presence.subscribe(PresenceEventType.Leave, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event
    await context.chatRoom.presence.update({ customKeyOne: 1 });

    // Wait for the enter event to be received
    await assertNoPresenceEvent(presenceEvents, PresenceEventType.Enter, context.chat.clientId);

    // Unsubscribe from presence events
    unsubscribe();
  });

  it<TestContext>('should unsubscribe from presence events', async (context) => {
    const presenceEvents: PresenceEvent[] = [];
    const { unsubscribe } = context.chatRoom.presence.subscribe(
      [PresenceEventType.Enter, PresenceEventType.Update],
      (event) => {
        presenceEvents.push(event);
      },
    );

    // Enter presence to trigger the enter event
    await context.chatRoom.presence.enter({ customKeyOne: 1 });

    // Wait for the enter event to be received
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Enter, data: { customKeyOne: 1 } },
      presenceEvents,
    );

    // Unsubscribe from presence events
    unsubscribe();

    // Trigger an update event
    await context.chatRoom.presence.update({ customKeyOne: 2 });

    // Assert that the update event was not received
    await assertNoPresenceEvent(presenceEvents, PresenceEventType.Update, context.chat.clientId);

    // A second call to unsubscribe should not throw an error
    unsubscribe();
  });

  it<TestContext>('should successfully subscribe to update events ', async (context) => {
    // Subscribe to update events
    const presenceEvents: PresenceEvent[] = [];
    context.chatRoom.presence.subscribe(PresenceEventType.Update, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event and then update our data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    await context.chatRoom.presence.update({ customKeyOne: 2 });

    // Wait for the update event to be received
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Update, data: { customKeyOne: 2 } },
      presenceEvents,
    );
  });

  it<TestContext>('should successfully subscribe to leave events ', async (context) => {
    // Subscribe to leave events
    const presenceEvents: PresenceEvent[] = [];
    context.chatRoom.presence.subscribe(PresenceEventType.Leave, (event) => {
      presenceEvents.push(event);
    });

    // Enter presence to trigger the enter event and then update our data
    await context.chatRoom.presence.enter({ customKeyOne: 1 });
    await context.chatRoom.presence.leave({ customKeyOne: 3 });

    // Wait for the update event to be received
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Leave, data: { customKeyOne: 3 } },
      presenceEvents,
    );
  });

  it<TestContext>('should successfully handle multiple data types', async (context) => {
    // Subscribe to leave events
    const presenceEvents: PresenceEvent[] = [];
    context.chatRoom.presence.subscribe((event) => {
      presenceEvents.push(event);
    });
    // Enter presence to trigger the enter event with undefined data
    await context.chatRoom.presence.enter();
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Enter, data: undefined },
      presenceEvents,
    );
    // Update with string
    await context.chatRoom.presence.update('string');
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Update, data: 'string' },
      presenceEvents,
    );
    // Update with number
    await context.chatRoom.presence.update(1);
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Update, data: 1 },
      presenceEvents,
    );
    // Update with boolean
    await context.chatRoom.presence.update(true);
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Update, data: true },
      presenceEvents,
    );
    // Update with object
    await context.chatRoom.presence.update({ key: 'value' });
    await waitForExpectedPresenceEvent(
      { clientId: context.chat.clientId, type: PresenceEventType.Update, data: { key: 'value' } },
      presenceEvents,
    );
  });
});
