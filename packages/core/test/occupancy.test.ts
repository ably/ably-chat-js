import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { channelEventEmitter } from '../../shared/testhelper/channel.ts';
import { makeTestLogger } from '../../shared/testhelper/logger.ts';
import { makeRandomRoom } from '../../shared/testhelper/room.ts';
import { ChatApi } from '../src/chat-api.ts';
import { DefaultOccupancy, OccupancyEvent } from '../src/occupancy.ts';
import { Room } from '../src/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  room: Room;
  currentChannelOptions: Ably.ChannelOptions;
  emulateOccupancyUpdate: Ably.messageCallback<Partial<Ably.Message>>;
}

vi.mock('ably');

describe('Occupancy', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
    const channel = context.room.occupancy.channel;
    context.emulateOccupancyUpdate = channelEventEmitter(channel);
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
        } catch (error: unknown) {
          reject(error as Error);
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
        } catch (error: unknown) {
          reject(error as Error);
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

  it<TestContext>('allows listener to unsubscribe', (context) => {
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

  it<TestContext>('has an attachment error code', (context) => {
    expect((context.room.occupancy as DefaultOccupancy).attachmentErrorCode).toBe(102004);
  });

  it<TestContext>('has a detachment error code', (context) => {
    expect((context.room.occupancy as DefaultOccupancy).detachmentErrorCode).toBe(102053);
  });
});
