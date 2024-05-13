// UserPresence.test.ts
import { UserPresence } from '../src/UserPresence.js';
import * as Ably from 'ably';
import { PresenceAction, Realtime } from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';
import { ablyRealtimeClient, defaultTestClientId } from './helper/realtimeClient.js';
import { PresenceEvents } from '../src/events.js';

interface TestContext {
  realtime: Ably.Realtime;
  userPresence: UserPresence;
}

describe('UserPresence', () => {
  beforeEach<TestContext>(async (context) => {
    context.realtime = ablyRealtimeClient();
    const roomId = Math.random().toString(36).substring(7);
    context.userPresence = new UserPresence(roomId, context.realtime, defaultTestClientId);
  });

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

  describe('When entering presence', async () => {
    it<TestContext>('successfully enter with clientId and custom user data', async (context) => {
      const enterEventPromise = waitForEvent(
        context.realtime,
        'enter',
        context.userPresence.realtimeChannelName,
        (member) => {
          expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(defaultTestClientId);
          expect(member.data, 'data should be equal to supplied userCustomData').toEqual(
            '{"userCustomData":{"customKeyOne":1}}',
          );
        },
      );
      // Enter with custom user data
      await context.userPresence.enter({ customKeyOne: 1 });
      // Wait for the enter event to be received
      await enterEventPromise;
    }, 5000);
  });
  describe('When sending presence updates', async () => {
    it<TestContext>('should successfully send presence update with clientId and custom user data', async (context) => {
      const enterEventPromise = waitForEvent(
        context.realtime,
        'update',
        context.userPresence.realtimeChannelName,
        (member) => {
          expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(defaultTestClientId);
          expect(member.data, 'data should be equal to supplied userCustomData').toEqual(
            '{"userCustomData":{"customKeyOne":1}}',
          );
        },
      );
      // Enter with custom user data
      await context.userPresence.enter({ customKeyOne: 1 });
      // Send presence update with custom user data
      await context.userPresence.update({ customKeyOne: 1 });
      // Wait for the update event to be received
      await enterEventPromise;
    }, 5000);
  });
  describe('When leaving presence', async () => {
    it<TestContext>('should successfully leave presence ', async (context) => {
      const enterEventPromise = waitForEvent(
        context.realtime,
        'leave',
        context.userPresence.realtimeChannelName,
        (member) => {
          expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(defaultTestClientId);
          expect(member.data, 'data should be equal to supplied userCustomData').toEqual(
            '{"userCustomData":{"customKeyOne":1}}',
          );
        },
      );
      // Enter with custom user data
      await context.userPresence.enter({ customKeyOne: 1 });
      // Leave with custom user data
      await context.userPresence.leave({ customKeyOne: 1 });
      // Wait for the leave event to be received
      await enterEventPromise;
    }, 5000);
  });

  describe('When fetching presence users', () => {
    it<TestContext>('should successfully fetch presence users ', async (context) => {
      // Connect 3 clients to the same channel
      const client1 = ablyRealtimeClient({ clientId: 'clientId1' }).channels.get(
        context.userPresence.realtimeChannelName,
      );
      const client2 = ablyRealtimeClient({ clientId: 'clientId2' }).channels.get(
        context.userPresence.realtimeChannelName,
      );
      const client3 = ablyRealtimeClient({ clientId: 'clientId3' }).channels.get(
        context.userPresence.realtimeChannelName,
      );

      // Enter presence for each client
      await client1.presence.enterClient('clientId1');
      await client2.presence.enterClient('clientId2');
      await client3.presence.enterClient('clientId3');

      // Check if all clients are present
      const fetchedPresence = await context.userPresence.get();
      expect(fetchedPresence, 'fetched presence should contain clientId1, clientId3 and clientId3').toEqual(
        expect.arrayContaining([
          { clientId: 'clientId1', status: 'present' },
          { clientId: 'clientId2', status: 'present' },
          { clientId: 'clientId3', status: 'present' },
        ]),
      );
    });
  });
  describe('When fetching a single presence user', () => {
    it<TestContext>('should successfully fetch a single presence user ', async (context) => {
      // Enter presence for a client
      await context.userPresence.enter();
      // Fetch the presence list and check if the client is present
      const userIsPresent = await context.userPresence.userIsPresent(defaultTestClientId);
      expect(userIsPresent, 'user with clientId should be present').toEqual(true);
      // Ensure that a user that has not entered presence is not present
      const userIsNotPresent = await context.userPresence.userIsPresent('clientId2');
      expect(userIsNotPresent, 'user with clientId1 should not be present').toEqual(false);
    });
  });
  describe('When subscribing to presence events', () => {
    it<TestContext>('should successfully subscribe to enter events ', async (context) => {
      // Subscribe to enter events
      const enterEventPromise = new Promise<void>((resolve) => {
        context.userPresence.subscribe(PresenceEvents.enter, (member) => {
          expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(defaultTestClientId);
          expect(member.data, 'data should be equal to supplied userCustomData').toEqual({ customKeyOne: 1 });
          resolve();
        });
      });
      // Enter presence to trigger the enter event
      await context.userPresence.enter({ customKeyOne: 1 });
      // Wait for the enter event to be received
      await enterEventPromise;
    });
    it<TestContext>('should successfully subscribe to update events ', async (context) => {
      // Subscribe to update events
      const updateEventPromise = new Promise<void>((resolve) => {
        context.userPresence.subscribe(PresenceEvents.update, (member) => {
          expect(member.data, 'data should be equal to supplied userCustomData').toEqual({ customKeyOne: 1 });
          expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(defaultTestClientId);
          resolve();
        });
      });
      // Enter presence and update presence to trigger the update event
      await context.userPresence.enter();
      await context.userPresence.update({ customKeyOne: 1 });
      // Wait for the update event to be received
      await updateEventPromise;
    });
    it<TestContext>('should successfully subscribe to leave events ', async (context) => {
      // Subscribe to leave events
      const leaveEventPromise = new Promise<void>((resolve) => {
        context.userPresence.subscribe(PresenceEvents.leave, (member) => {
          expect(member.clientId, 'client id should be equal to defaultTestClientId').toEqual(defaultTestClientId);
          expect(member.data, 'data should be equal to supplied userCustomData').toEqual({ customKeyOne: 1 });
          resolve();
        });
      });
      // Enter presence and leave presence to trigger the leave event
      await context.userPresence.enter();
      await context.userPresence.leave({ customKeyOne: 1 });
      // Wait for the leave event to be received
      await leaveEventPromise;
    });
  });
});
