import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { OccupancyEvent } from '../../src/core/events.ts';
import { DefaultOccupancy } from '../../src/core/occupancy.ts';
import { Room } from '../../src/core/room.ts';
import { channelEventEmitter } from '../helper/channel.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

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
    context.room = makeRandomRoom({
      chatApi: context.chatApi,
      realtime: context.realtime,
      options: {
        occupancy: {
          enableEvents: true,
        },
      },
    });
    const channel = context.room.channel;
    context.emulateOccupancyUpdate = channelEventEmitter(channel);
  });

  it<TestContext>('throws an error when subscribing with enableEvents disabled', (context) => {
    const room = makeRandomRoom({
      chatApi: context.chatApi,
      realtime: context.realtime,
      options: {
        occupancy: {
          enableEvents: false,
        },
      },
    });

    expect(() => {
      room.occupancy.subscribe(() => {
        // This should not be called
      });
    }).toThrow('cannot subscribe to occupancy; occupancy events are not enabled in room options');
  });

  it<TestContext>('receives occupancy updates', (context) =>
    new Promise<void>((done, reject) => {
      // Setup room with enableEvents enabled
      const room = makeRandomRoom({
        chatApi: context.chatApi,
        realtime: context.realtime,
        options: {
          occupancy: {
            enableEvents: true,
          },
        },
      });

      room.occupancy.subscribe((event: OccupancyEvent) => {
        try {
          expect(event).toEqual({
            type: 'occupancy.updated',
            occupancy: {
              connections: 5,
              presenceMembers: 3,
            },
          });
          done();
        } catch (error: unknown) {
          reject(error as Error);
        }
      });

      const emitter = channelEventEmitter(room.channel);
      emitter({
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
            type: 'occupancy.updated',
            occupancy: {
              connections: 0,
              presenceMembers: 0,
            },
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
      type: 'occupancy.updated',
      occupancy: {
        connections: 0,
        presenceMembers: 0,
      },
    });

    // Calling unsubscribe again should not throw
    unsubscribe();
  });

  it<TestContext>('should only unsubscribe the correct subscription', (context) => {
    const { room } = context;
    const received: OccupancyEvent[] = [];

    const emulateUpdate = (connections: number, presenceMembers: number) => {
      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: {
            connections,
            presenceMembers,
          },
        },
      });
    };

    const listener = (event: OccupancyEvent) => {
      received.push(event);
    };

    // Subscribe the same listener twice
    const subscription1 = room.occupancy.subscribe(listener);
    const subscription2 = room.occupancy.subscribe(listener);

    // Both subscriptions should trigger the listener
    emulateUpdate(5, 3);
    expect(received).toHaveLength(2);

    // Unsubscribe first subscription
    subscription1.unsubscribe();

    // One subscription should still trigger the listener
    emulateUpdate(6, 4);
    expect(received).toHaveLength(3);

    // Unsubscribe second subscription
    subscription2.unsubscribe();

    // No subscriptions should trigger the listener
    emulateUpdate(7, 5);
    expect(received).toHaveLength(3);
  });

  it<TestContext>('handles invalid occupancy events', (context) => {
    const room = context.room;
    let receivedEvent: OccupancyEvent | undefined;
    room.occupancy.subscribe((event) => {
      receivedEvent = event;
    });

    // Send an invalid occupancy event
    context.emulateOccupancyUpdate({
      name: '[meta]occupancy',
      data: {
        metrics: {
          connections: 'abc',
          presenceMembers: 6,
        },
      },
    });

    // Should still call the listener with default values for invalid data
    expect(receivedEvent).toBeDefined();
    if (receivedEvent) {
      expect(receivedEvent.type).toBe('occupancy.updated');
      expect(receivedEvent.occupancy).toEqual({ connections: 0, presenceMembers: 6 });
    }
  });

  // CHA-O7
  describe('current()', () => {
    // CHA-O7c
    it<TestContext>('throws an error when events are disabled', (context) => {
      const room = makeRandomRoom({
        chatApi: context.chatApi,
        realtime: context.realtime,
        options: {
          occupancy: {
            enableEvents: false,
          },
        },
      });

      expect(() => {
        room.occupancy.current();
      }).toThrow('cannot get current occupancy; occupancy events are not enabled in room options');
    });

    // CHA-O7b
    it<TestContext>('returns undefined when no events have been received', (context) => {
      expect(context.room.occupancy.current()).toBeUndefined();
    });

    // CHA-O7a
    it<TestContext>('returns the latest occupancy data after receiving events', (context) => {
      // Send first event
      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: {
            connections: 5,
            presenceMembers: 3,
          },
        },
      });

      expect(context.room.occupancy.current()).toEqual({
        connections: 5,
        presenceMembers: 3,
      });

      // Send second event
      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: {
            connections: 7,
            presenceMembers: 4,
          },
        },
      });

      expect(context.room.occupancy.current()).toEqual({
        connections: 7,
        presenceMembers: 4,
      });
    });
  });

  describe('dispose', () => {
    it<TestContext>('should dispose and clean up all realtime channel subscriptions', (context) => {
      const { room } = context;
      const channel = room.channel;
      const occupancy = room.occupancy as DefaultOccupancy;

      // Mock channel unsubscribe to verify cleanup calls
      const unsubscribeSpy = vi.spyOn(channel, 'unsubscribe');

      // Dispose should clean up listeners and subscriptions
      expect(() => {
        occupancy.dispose();
      }).not.toThrow();

      // Verify that channel unsubscribe was called
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    });

    it<TestContext>('should remove user-level listeners and occupancy event subscriptions', (context) => {
      const occupancy = context.room.occupancy as DefaultOccupancy;

      // Subscribe to add listeners
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      context.room.occupancy.subscribe(listener1);
      context.room.occupancy.subscribe(listener2);

      // Emulate an occupancy update and check the listeners were called
      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: { connections: 5, presenceMembers: 3 },
        },
      });

      // Verify that the listeners were called
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Reset the listeners
      listener1.mockClear();
      listener2.mockClear();

      // Dispose should clean up listeners and subscriptions
      expect(() => {
        occupancy.dispose();
      }).not.toThrow();

      // Emulate an occupancy update and check the listeners were not called
      context.emulateOccupancyUpdate({
        name: '[meta]occupancy',
        data: {
          metrics: { connections: 5, presenceMembers: 3 },
        },
      });

      // Verify that the listeners were not called
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();

      // Verify that user-provided listeners were unsubscribed
      expect(occupancy.hasListeners()).toBe(false);

      // Cleanup should not fail on multiple calls
      expect(() => {
        occupancy.dispose();
      }).not.toThrow();
    });

    it<TestContext>('should handle dispose when no listeners are registered', (context) => {
      const occupancy = context.room.occupancy as DefaultOccupancy;

      // Should not throw when called with no listeners
      expect(() => {
        occupancy.dispose();
      }).not.toThrow();
    });
  });
});
