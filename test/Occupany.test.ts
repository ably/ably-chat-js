import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.js';
import { OccupancyEvent } from '../src/Occupancy.js';
import { DefaultRoom } from '../src/Room.js';
import { randomRoomId } from './helper/identifier.js';
import { makeTestLogger } from './helper/logger.js';
import { testClientOptions } from './helper/options.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  channelLevelListeners: Map<Ably.messageCallback<Ably.Message>, string[]>;
  roomId: string;
  currentChannelOptions: Ably.ChannelOptions;
  emulateOccupancyUpdate: Ably.messageCallback<Partial<Ably.Message>>;
}

vi.mock('ably');

// Helper function to create a room
const makeRoom = (context: TestContext) =>
  new DefaultRoom(context.roomId, context.realtime, context.chatApi, testClientOptions(), makeTestLogger());

describe('Occupancy', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.roomId = randomRoomId();
    context.channelLevelListeners = new Map<Ably.messageCallback<Ably.Message>, string[]>();
    context.currentChannelOptions = {};
    context.emulateOccupancyUpdate = (message: Partial<Ably.Message>) => {
      for (const listener of context.channelLevelListeners.keys()) {
        listener(message as Ably.Message);
      }
    };

    const channel = context.realtime.channels.get(`${context.roomId}::$chat::$chatMessages`);

    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-ignore
      async (
        nameOrListener: string[] | Ably.messageCallback<Ably.Message>,
        listener?: Ably.messageCallback<Ably.Message>,
      ) => {
        if (listener) {
          context.channelLevelListeners.set(listener, nameOrListener as string[]);
        } else {
          context.channelLevelListeners.set(nameOrListener as Ably.messageCallback<Ably.Message>, []);
        }
      },
    );

    vi.spyOn(channel, 'unsubscribe').mockImplementation(
      // @ts-ignore
      async (listener: Ably.messageCallback<Ably.Message>) => {
        context.channelLevelListeners.delete(listener);
      },
    );

    // Mock the attach
    vi.spyOn(channel, 'attach').mockImplementation(async () => {
      return null;
    });

    // Mock the detach
    vi.spyOn(channel, 'detach').mockImplementation(async () => {});

    // Mock the setOptions
    vi.spyOn(channel, 'setOptions').mockImplementation(async (options: Ably.ChannelOptions) => {
      context.currentChannelOptions = options;
    });
  });

  it<TestContext>('registers its internal listener as subscriptions change', async (context) => {
    const { channelLevelListeners } = context;

    const room = makeRoom(context);
    const listener1 = () => {};
    const listener2 = () => {};

    // First listener added, internal listener should be registered
    await room.occupancy.subscribe(listener1);
    expect(channelLevelListeners).toHaveLength(1);
    expect(channelLevelListeners.values().next().value).toEqual(['[meta]occupancy']);

    // A second listener added, internal listener should still be registered but not added again
    await room.occupancy.subscribe(listener2);
    expect(channelLevelListeners).toHaveLength(1);
    expect(channelLevelListeners.values().next().value).toEqual(['[meta]occupancy']);

    // First listener removed, internal listener should still be registered
    await room.occupancy.unsubscribe(listener1);
    expect(channelLevelListeners).toHaveLength(1);
    expect(channelLevelListeners.values().next().value).toEqual(['[meta]occupancy']);

    // Second listener removed, internal listener should be removed
    await room.occupancy.unsubscribe(listener2);
    expect(channelLevelListeners).toHaveLength(0);
  });

  it<TestContext>('enables channel occupancy as subscriptions change', async (context) => {
    const room = makeRoom(context);
    const listener1 = () => {};
    const listener2 = () => {};

    // First listener added, options should be set
    await room.occupancy.subscribe(listener1);
    expect(context.currentChannelOptions).toEqual({ params: { occupancy: 'metrics' } });

    // A second listener added, options should still be set
    await room.occupancy.subscribe(listener2);
    expect(context.currentChannelOptions).toEqual({ params: { occupancy: 'metrics' } });

    // First listener removed, options should still be set
    await room.occupancy.unsubscribe(listener1);
    expect(context.currentChannelOptions).toEqual({ params: { occupancy: 'metrics' } });

    // Second listener removed, options should be cleared
    await room.occupancy.unsubscribe(listener2);
    expect(context.currentChannelOptions).toEqual({});
  });

  it<TestContext>('receives occupancy updates', async (context) =>
    new Promise<void>((done, reject) => {
      const room = makeRoom(context);
      room.occupancy
        .subscribe((event: OccupancyEvent) => {
          try {
            expect(event).toEqual({
              connections: 5,
              presenceMembers: 3,
            });
            done();
          } catch (err) {
            reject(err);
          }
        })
        .then(() => {
          context.emulateOccupancyUpdate({
            name: '[meta]occupancy',
            data: {
              metrics: {
                connections: 5,
                presenceMembers: 3,
              },
            },
          });
        })
        .catch((err) => {
          reject(err);
        });
    }));

  it<TestContext>('receives occupancy updates zero values', async (context) =>
    new Promise<void>((done, reject) => {
      const room = makeRoom(context);
      room.occupancy
        .subscribe((event: OccupancyEvent) => {
          try {
            expect(event).toEqual({
              connections: 0,
              presenceMembers: 0,
            });
            done();
          } catch (err) {
            reject(err);
          }
        })
        .then(() => {
          context.emulateOccupancyUpdate({
            name: '[meta]occupancy',
            data: {
              metrics: {
                connections: 0,
                presenceMembers: 0,
              },
            },
          });
        })
        .catch((err) => {
          reject(err);
        });
    }));

  it<TestContext>('raises an error if no connections in occupancy data', async (context) =>
    new Promise<void>((done, reject) => {
      const room = makeRoom(context);
      room.occupancy
        .subscribe(() => {
          reject('should not have received occupancy event without connections');
        })
        .then(() => {
          context.emulateOccupancyUpdate({
            name: '[meta]occupancy',
            data: {
              metrics: {
                presenceMembers: 3,
              },
            },
          });
        })
        .then(() => {
          done();
        })
        .catch((error: Ably.ErrorInfo) => {
          reject(error);
        });
    }));

  it<TestContext>('raises an error if no presenceMembers in occupancy data', async (context) =>
    new Promise<void>((done, reject) => {
      const room = makeRoom(context);
      room.occupancy
        .subscribe(() => {
          reject('should not have received occupancy event without presenceMembers');
        })
        .then(() => {
          context.emulateOccupancyUpdate({
            name: '[meta]occupancy',
            data: {
              metrics: {
                connections: 5,
              },
            },
          });
        })
        .then(() => {
          done();
        })
        .catch((error: Ably.ErrorInfo) => {
          reject(error);
        });
    }));

  it<TestContext>('raises an error if no metrics in occupancy data', async (context) =>
    new Promise<void>((done, reject) => {
      const room = makeRoom(context);
      room.occupancy
        .subscribe(() => {
          reject('should not have received occupancy event without metrics');
        })
        .then(() => {
          context.emulateOccupancyUpdate({
            name: '[meta]occupancy',
            data: {},
          });
        })
        .then(() => {
          done();
        })
        .catch((error: Ably.ErrorInfo) => {
          reject(error);
        });
    }));
});
