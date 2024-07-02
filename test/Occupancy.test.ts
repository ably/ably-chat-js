import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.js';
import { OccupancyEvent } from '../src/Occupancy.js';
import { DefaultRoom } from '../src/Room.js';
import { channelEventEmitter } from './helper/channel.js';
import { makeTestLogger } from './helper/logger.js';
import { makeRandomRoom } from './helper/room.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  room: DefaultRoom;
  currentChannelOptions: Ably.ChannelOptions;
  emulateOccupancyUpdate: Ably.messageCallback<Partial<Ably.Message>>;
}

vi.mock('ably');

describe('Occupancy', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
    context.emulateOccupancyUpdate = channelEventEmitter(context.room.occupancy.channel);
  });

  it<TestContext>('receives occupancy updates', (context) =>
    new Promise<void>((done, reject) => {
      context.room.occupancy.subscribe((event: OccupancyEvent) => {
        try {
          expect(event).toEqual({
            connections: 5,
            presenceMembers: 3,
          });
          done();
        } catch (err: unknown) {
          reject(err as Error);
        }
      });

      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: {
            connections: 5,
            presenceMembers: 3,
          },
        },
      });
    }));

  it<TestContext>('receives occupancy updates zero values', async (context) =>
    new Promise<void>((done, reject) => {
      context.room.occupancy.subscribe((event: OccupancyEvent) => {
        try {
          expect(event).toEqual({
            connections: 0,
            presenceMembers: 0,
          });
          done();
        } catch (err: unknown) {
          reject(err as Error);
        }
      });

      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: {
            connections: 0,
            presenceMembers: 0,
          },
        },
      });
    }));

  it<TestContext>('allows listener unsubscription', (context) => {
    const receivedEvents: OccupancyEvent[] = [];
    const { unsubscribe } = context.room.occupancy.subscribe((event: OccupancyEvent) => {
      receivedEvents.push(event);
    });

    // We should get this event
    context.emulateOccupancyUpdate({
      name: '[meta]occupancy',
      data: {
        metrics: {
          connections: 0,
          presenceMembers: 0,
        },
      },
    });

    // Unsubscribe
    unsubscribe();

    // We should not get this event
    context.emulateOccupancyUpdate({
      name: '[meta]occupancy',
      data: {
        metrics: {
          connections: 5,
          presenceMembers: 3,
        },
      },
    });

    // Check that we only received the first event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      connections: 0,
      presenceMembers: 0,
    });

    // Calling unsubscribe again should not throw
    unsubscribe();
  });

  it<TestContext>('allows all listeners to be unsubscribed', (context) => {
    const receivedEvents: OccupancyEvent[] = [];
    const { unsubscribe } = context.room.occupancy.subscribe((event: OccupancyEvent) => {
      receivedEvents.push(event);
    });

    const receivedEvents2: OccupancyEvent[] = [];
    const { unsubscribe: unsubscribe2 } = context.room.occupancy.subscribe((event: OccupancyEvent) => {
      receivedEvents2.push(event);
    });

    // We should get this event
    context.emulateOccupancyUpdate({
      name: '[meta]occupancy',
      data: {
        metrics: {
          connections: 0,
          presenceMembers: 0,
        },
      },
    });

    // Unsubscribe all
    context.room.occupancy.unsubscribeAll();

    // We should not get this event
    context.emulateOccupancyUpdate({
      name: '[meta]occupancy',
      data: {
        metrics: {
          connections: 5,
          presenceMembers: 3,
        },
      },
    });

    // Check that we only received the first event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({
      connections: 0,
      presenceMembers: 0,
    });
    expect(receivedEvents2).toHaveLength(1);
    expect(receivedEvents2[0]).toEqual({
      connections: 0,
      presenceMembers: 0,
    });

    // Calling unsubscribe again should not throw
    unsubscribe();
    unsubscribe2();
  });

  describe.each([
    ['invalid event name', { name: '[meta]occupancy2', data: { metrics: { connections: 5, presenceMembers: 6 } } }],
    ['no connections', { name: '[meta]occupancy', data: { metrics: { presenceMembers: 6 } } }],
    [
      'connections not number',
      { name: '[meta]occupancy', data: { metrics: { connections: 'abc', presenceMembers: 6 } } },
    ],
    [
      'connections not integer',
      { name: '[meta]occupancy', data: { metrics: { connections: 6.6, presenceMembers: 6 } } },
    ],
    ['no presence members', { name: '[meta]occupancy', data: { metrics: { connections: 5 } } }],
    [
      'presence members not number',
      { name: '[meta]occupancy', data: { metrics: { connections: 5, presenceMembers: 'abc' } } },
    ],
    [
      'presence members not integer',
      { name: '[meta]occupancy', data: { metrics: { connections: 5, presenceMembers: 6.6 } } },
    ],
    ['no metrics', { name: '[meta]occupancy', data: {} }],
    ['metrics not object', { name: '[meta]occupancy', data: { metrics: 'abc' } }],
    ['no data', { name: '[meta]occupancy' }],
    ['data not object', { name: '[meta]occupancy', data: 'abc' }],
  ])('invalid occupancy events', (testName: string, event: Partial<Ably.InboundMessage>) => {
    it<TestContext>('it handles invalid occupancy events: ' + testName, (context) => {
      const room = context.room;
      let listenerCalled = false;
      room.occupancy.subscribe(() => {
        listenerCalled = true;
      });

      context.emulateOccupancyUpdate(event);
      expect(listenerCalled).toBe(false);
    });
  });
});
