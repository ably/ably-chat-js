import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { ErrorCode } from '../../src/core/errors.ts';
import { PresenceEventType } from '../../src/core/events.ts';
import {
  DefaultPresence,
  Presence,
  PresenceData,
  PresenceEvent,
  PresenceStateChange,
  PresenceStateChangeListener,
} from '../../src/core/presence.ts';
import { Room } from '../../src/core/room.ts';
import { RoomOptions } from '../../src/core/room-options.ts';
import { Subscription } from '../../src/core/subscription.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { waitForOffTimes, waitForUnsubscribeTimes } from '../helper/realtime-subscriptions.ts';
import { makeRandomRoom } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  room: Room;
  presence: PresenceWithStateChangeListener;
  makeRoom: (options?: RoomOptions) => Room;
  currentChannelOptions: Ably.ChannelOptions;
}

interface PresenceWithStateChangeListener extends Presence {
  onPresenceStateChange: (listener: PresenceStateChangeListener) => Subscription;
}

vi.mock('ably');

describe('Presence', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.makeRoom = (options) => makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime, options });
    context.room = context.makeRoom();
  });

  describe<TestContext>('subscribe', () => {
    it<TestContext>('throws ErrorInfo if presence events are not enabled', (context) => {
      const room = context.makeRoom({ presence: { enableEvents: false } });

      expect(() => {
        room.presence.subscribe(() => {});
      }).toThrowErrorInfo({
        message: 'could not subscribe to presence; presence events are not enabled',
        code: ErrorCode.FeatureNotEnabledInRoom,
      });
    });

    it<TestContext>('should only unsubscribe the correct subscription', (context) => {
      const { room } = context;
      const received: PresenceEvent[] = [];

      const emulatePresenceEvent = (clientId: string, type: PresenceEventType, data?: PresenceData) => {
        const presenceMessage: Ably.PresenceMessage = {
          action: type,
          clientId,
          timestamp: Date.now(),
          data: data ? { userCustomData: data } : undefined,
          connectionId: 'connection-id',
          encoding: '',
          id: 'message-id',
          extras: null,
        };

        // Call the subscribeToEvents handler directly
        (room.presence as DefaultPresence).subscribeToEvents(presenceMessage);
      };

      const listener = (event: PresenceEvent) => {
        received.push(event);
      };

      // Subscribe the same listener twice
      const subscription1 = room.presence.subscribe(listener);
      const subscription2 = room.presence.subscribe(listener);

      // Both subscriptions should trigger the listener
      emulatePresenceEvent('user1', PresenceEventType.Enter, { foo: 'bar' });
      expect(received).toHaveLength(2);

      // Unsubscribe first subscription
      subscription1.unsubscribe();

      // One subscription should still trigger the listener
      emulatePresenceEvent('user2', PresenceEventType.Enter, { baz: 'qux' });
      expect(received).toHaveLength(3);

      // Unsubscribe second subscription
      subscription2.unsubscribe();

      // No subscriptions should trigger the listener
      emulatePresenceEvent('user3', PresenceEventType.Enter, { test: 'data' });
      expect(received).toHaveLength(3);
    });
  });

  describe<TestContext>('room configuration', () => {
    it<TestContext>('removes the presence channel mode if room option disabled', (context) => {
      vi.spyOn(context.realtime.channels, 'get');
      const room = context.makeRoom({ presence: { enableEvents: false } });

      // Check the channel was called as planned
      expect(context.realtime.channels.get).toHaveBeenCalledOnce();
      expect(context.realtime.channels.get).toHaveBeenCalledWith(
        room.channel.name,
        expect.objectContaining({
          modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE', 'ANNOTATION_PUBLISH'],
        }),
      );
    });
  });

  it<TestContext>('does not remove mode if option enabled', (context) => {
    vi.spyOn(context.realtime.channels, 'get');
    const room = context.makeRoom({ presence: { enableEvents: true } });

    // Check the channel was called as planned
    expect(context.realtime.channels.get).toHaveBeenCalledOnce();
    expect(context.realtime.channels.get).toHaveBeenCalledWith(
      room.channel.name,
      expect.not.objectContaining({
        modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE'],
      }),
    );
  });

  describe<TestContext>('isUserPresent', () => {
    it<TestContext>('throws ErrorInfo if channel is not attached', async (context) => {
      const room = context.makeRoom({ presence: { enableEvents: true } });
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('detached');

      await expect(room.presence.isUserPresent('clientId')).rejects.toBeErrorInfo({
        code: ErrorCode.RoomInInvalidState,
        message: 'could not perform presence operation; room is not attached',
      });
    });
  });

  describe<TestContext>('enter', () => {
    it<TestContext>('throws ErrorInfo if channel is not attached', async (context) => {
      const room = context.makeRoom({ presence: { enableEvents: true } });
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('detached');

      await expect(room.presence.enter({ foo: 'bar' })).rejects.toBeErrorInfo({
        code: ErrorCode.RoomInInvalidState,
        message: 'could not perform presence operation; room is not attached',
      });
    });
  });

  describe<TestContext>('update', () => {
    it<TestContext>('throws ErrorInfo if channel is not attached', async (context) => {
      const room = context.makeRoom({ presence: { enableEvents: true } });
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('detached');

      await expect(room.presence.update({ foo: 'bar' })).rejects.toBeErrorInfo({
        code: ErrorCode.RoomInInvalidState,
        message: 'could not perform presence operation; room is not attached',
      });
    });
  });

  describe<TestContext>('leave', () => {
    it<TestContext>('throws ErrorInfo if channel is not attached', async (context) => {
      const room = context.makeRoom({ presence: { enableEvents: true } });
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('detached');

      await expect(room.presence.leave()).rejects.toBeErrorInfo({
        code: ErrorCode.RoomInInvalidState,
        message: 'could not perform presence operation; room is not attached',
      });
    });
  });

  describe<TestContext>('get', () => {
    it<TestContext>('throws ErrorInfo if channel is not attached', async (context) => {
      const room = context.makeRoom({ presence: { enableEvents: true } });
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('detached');

      await expect(room.presence.get()).rejects.toBeErrorInfo({
        code: ErrorCode.RoomInInvalidState,
        message: 'could not perform presence operation; room is not attached',
      });
    });
  });

  describe<TestContext>('onPresenceStateChange', () => {
    it<TestContext>('should emit state change event when enter succeeds', async (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];

      // Mock the channel state to be attached
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Mock the enter method to resolve
      vi.spyOn(room.channel.presence, 'enter').mockResolvedValue();

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Call enter
      await room.presence.enter({ foo: 'bar' });

      // Verify state change event was emitted
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(true);
      expect(stateChanges[0]?.error).toBeUndefined();

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event with error when enter fails', async (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];
      const error = new Ably.ErrorInfo('enter error', 40000, 400);

      // Mock the channel state to be attached
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Mock the enter method to reject
      vi.spyOn(room.channel.presence, 'enter').mockRejectedValue(error);

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Call enter and expect it to reject
      await expect(room.presence.enter({ foo: 'bar' })).rejects.toBeErrorInfo({
        code: 40000,
        message: 'enter error',
      });

      // Verify state change event was emitted with error
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeErrorInfo({
        code: 40000,
        message: 'enter error',
      });

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event when update succeeds', async (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];

      // Mock the channel state to be attached
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Mock the update method to resolve
      vi.spyOn(room.channel.presence, 'update').mockResolvedValue();

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Call update
      await room.presence.update({ foo: 'bar' });

      // Verify state change event was emitted
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(true);
      expect(stateChanges[0]?.error).toBeUndefined();

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event with error when update fails', async (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];
      const error = new Ably.ErrorInfo('update error', 40000, 400);

      // Mock the channel state to be attached
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // Mock the update method to reject
      vi.spyOn(room.channel.presence, 'update').mockRejectedValue(error);

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Call update and expect it to reject
      await expect(room.presence.update({ foo: 'bar' })).rejects.toBeErrorInfo({
        code: 40000,
        message: 'update error',
      });

      // Verify state change event was emitted with error
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeErrorInfo({
        code: 40000,
        message: 'update error',
      });

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event when leave succeeds', async (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];

      // Mock the channel state to be attached
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // First set the state to present
      vi.spyOn(room.channel.presence, 'enter').mockResolvedValue();
      await room.presence.enter({ foo: 'bar' });

      // Clear any existing state changes
      stateChanges.length = 0;

      // Mock the leave method to resolve
      vi.spyOn(room.channel.presence, 'leave').mockResolvedValue();

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Call leave
      await room.presence.leave();

      // Verify state change event was emitted
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(true);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeUndefined();

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event with error when leave fails', async (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];
      const error = new Ably.ErrorInfo('leave error', 40000, 400);

      // Mock the channel state to be attached
      vi.spyOn(room.channel, 'state', 'get').mockReturnValue('attached');

      // First set the state to present
      vi.spyOn(room.channel.presence, 'enter').mockResolvedValue();
      await room.presence.enter({ foo: 'bar' });

      // Clear any existing state changes
      stateChanges.length = 0;

      // Mock the leave method to reject
      vi.spyOn(room.channel.presence, 'leave').mockRejectedValue(error);

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Call leave and expect it to reject
      await expect(room.presence.leave()).rejects.toBeErrorInfo({
        code: 40000,
        message: 'leave error',
      });

      // Verify state change event was emitted with error
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(true);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeErrorInfo({
        code: 40000,
        message: 'leave error',
      });

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should update presenceState when a channel state change with 91004 error occurs', (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];

      // Subscribe to state changes in presence
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // mock the channel emit method to simulate a channel state change
      const emit = (
        room.channel as unknown as {
          emit: (event: string, arg: unknown) => void;
        }
      ).emit;

      // Simulate a state change with auto retry failure (91004 error)
      const error = new Ably.ErrorInfo('Presence auto-reentry failed', 91004, 400);
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'attached',
        previous: 'attached',
        reason: error,
        resumed: false,
      };

      emit('update', channelStateChange);

      // Verify state change event was emitted with error
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeErrorInfo({
        code: 91004,
        message: 'Presence auto-reentry failed',
      });

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event when channel enters detached state', (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Mock the channel emit method to simulate a channel state change
      const emit = (
        room.channel as unknown as {
          emit: (event: string, arg: unknown) => void;
        }
      ).emit;

      // Simulate a channel state change to detached
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'detached',
        previous: 'attached',
        resumed: false,
      };

      emit('detached', channelStateChange);

      // Verify state change event was emitted with present: false
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeUndefined();

      // Clean up
      subscription.unsubscribe();
    });

    it<TestContext>('should emit state change event when channel enters failed state', (context) => {
      const { room } = context;
      const stateChanges: PresenceStateChange[] = [];

      // Subscribe to state changes
      const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange((change) => {
        stateChanges.push(change);
      });

      // Mock the channel emit method to simulate a channel state change
      const emit = (
        room.channel as unknown as {
          emit: (event: string, arg: unknown) => void;
        }
      ).emit;

      // Simulate a channel state change to failed
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'failed',
        previous: 'attached',
        resumed: false,
        reason: new Ably.ErrorInfo('some failure', 40000, 400),
      };

      emit('failed', channelStateChange);

      // Verify state change event was emitted with present: false
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]?.previous.present).toBe(false);
      expect(stateChanges[0]?.current.present).toBe(false);
      expect(stateChanges[0]?.error).toBeErrorInfo({ message: 'some failure', code: 40000, statusCode: 400 });

      // Clean up
      subscription.unsubscribe();
    });
  });

  describe('DefaultPresence.dispose', () => {
    it<TestContext>('should dispose and clean up all realtime channel subscriptions', async (context) => {
      const { room } = context;
      const channel = room.channel;
      const presence = room.presence as DefaultPresence;

      // Mock channel methods
      vi.spyOn(channel.presence, 'unsubscribe').mockImplementation(() => {});

      // Act - dispose presence
      presence.dispose();

      // Assert - verify the listeners were unsubscribed
      await waitForUnsubscribeTimes(channel.presence, 1);
    });

    it<TestContext>('should remove channel-level listeners', async (context) => {
      const { room } = context;
      const channel = room.channel;
      const presence = room.presence as DefaultPresence;

      // Mock channel methods
      vi.spyOn(channel, 'off').mockImplementation(() => {});

      // Act - dispose presence
      presence.dispose();

      // Assert - verify the listeners were unsubscribed
      await waitForOffTimes(channel, 2);
    });

    it<TestContext>('should remove user-level listeners and presence event subscriptions', (context) => {
      const presence = context.room.presence as DefaultPresence;

      const emulatePresenceEvent = (clientId: string, type: PresenceEventType, data?: PresenceData) => {
        const presenceMessage: Ably.PresenceMessage = {
          action: type,
          clientId,
          timestamp: Date.now(),
          data: data ? { userCustomData: data } : undefined,
          connectionId: 'connection-id',
          encoding: '',
          id: 'message-id',
          extras: null,
        };

        // Call the subscribeToEvents handler directly
        presence.subscribeToEvents(presenceMessage);
      };

      // Subscribe to add listeners
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      context.room.presence.subscribe(listener1);
      context.room.presence.subscribe(listener2);

      // Emulate a presence event and check the listeners were called
      emulatePresenceEvent('user1', PresenceEventType.Enter, { foo: 'bar' });

      // Verify that the listeners were called
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Reset the listeners
      listener1.mockClear();
      listener2.mockClear();

      // Dispose should clean up listeners and subscriptions
      expect(() => {
        presence.dispose();
      }).not.toThrow();

      // Emulate a presence event and check the listeners were not called
      emulatePresenceEvent('user1', PresenceEventType.Enter, { foo: 'bar' });

      // Verify that the listeners were not called
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();

      // Verify that user-provided listeners were unsubscribed
      expect(presence.hasListeners()).toBe(false);

      // Cleanup should not fail on multiple calls
      expect(() => {
        presence.dispose();
      }).not.toThrow();
    });

    it<TestContext>('should handle dispose when no listeners are registered', (context) => {
      const presence = context.room.presence as DefaultPresence;

      // Should not throw when called with no listeners
      expect(() => {
        presence.dispose();
      }).not.toThrow();
    });
  });
});
