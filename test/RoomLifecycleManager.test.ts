import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { RoomLifecycleManager } from '../src/RoomLifecycleManager.ts';
import { DefaultStatus, RoomStatus, Status } from '../src/RoomStatus.ts';
import { makeTestLogger } from './helper/logger.ts';

interface TestContext {
  realtime: Ably.Realtime;
  firstContributor: MockContributor;
  secondContributor: MockContributor;
  thirdContributor: MockContributor;
}

vi.mock('ably');

interface MockContributor {
  channel: Ably.RealtimeChannel;
  channelStateListeners: Set<Ably.channelEventCallback>;
  discontinuity(): void;
  emulateStateChange: Ably.channelEventCallback;
}

const baseError = new Ably.ErrorInfo('error', 500, 50000);
const baseError2 = new Ably.ErrorInfo('error2', 500, 50000);

enum AblyChannelState {
  Initialized = 'initialized',
  Attached = 'attached',
  Detached = 'detached',
  Failed = 'failed',
  Suspended = 'suspended',
  Attaching = 'attaching',
  Detaching = 'detaching',
}

const mockChannelAttachSuccess = (channel: Ably.RealtimeChannel): void => {
  vi.spyOn(channel, 'attach').mockImplementation(() => {
    vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Attached);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(baseError);

    return Promise.resolve(null);
  });
};

const mockChannelAttachFailureThenSuccess = (
  channel: Ably.RealtimeChannel,
  status: AblyChannelState,
  sequenceNumber: number,
): void => {
  vi.spyOn(channel, 'attach')
    .mockImplementationOnce(() => {
      const error = new Ably.ErrorInfo('error', sequenceNumber, 500);
      vi.spyOn(channel, 'state', 'get').mockImplementation(() => {
        vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Attached);

        return status;
      });
      vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(error);

      return Promise.reject(error as unknown as Error);
    })
    .mockImplementationOnce(() => {
      vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Attached);
      vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(baseError);

      return Promise.resolve(null);
    });
};

const mockChannelAttachFailure = (
  channel: Ably.RealtimeChannel,
  status: AblyChannelState,
  sequenceNumber: number,
): void => {
  vi.spyOn(channel, 'attach').mockImplementation(() => {
    const error = new Ably.ErrorInfo('error', sequenceNumber, 500);
    vi.spyOn(channel, 'state', 'get').mockReturnValue(status);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(error);

    return Promise.reject(error as unknown as Error);
  });
};

const mockChannelDetachNotCalled = (channel: Ably.RealtimeChannel): void => {
  vi.spyOn(channel, 'detach').mockRejectedValue(new Error('detach should not be called'));
};

const mockChannelDetachSuccess = (channel: Ably.RealtimeChannel): void => {
  vi.spyOn(channel, 'detach').mockImplementation(async () => {
    vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Detached);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(baseError);
    return Promise.resolve();
  });
};

const mockChannelDetachFailure = (
  channel: Ably.RealtimeChannel,
  status: AblyChannelState,
  sequenceNumber: number,
): void => {
  vi.spyOn(channel, 'detach').mockImplementation(async () => {
    const error = new Ably.ErrorInfo('error', sequenceNumber, 500);
    vi.spyOn(channel, 'state', 'get').mockReturnValue(status);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(error);
    return Promise.reject(error as unknown as Error);
  });
};

// Wait 3 seconds for the room to reach the expected status
const waitForRoomStatus = async (status: Status, expectedStatus: RoomStatus) => {
  return vi.waitUntil(() => status.currentStatus === expectedStatus, 3000);
};

const makeMockContributor = (channel: Ably.RealtimeChannel): MockContributor => {
  const contributor = {
    channel: channel,
    channelStateListeners: new Set<Ably.channelEventCallback>(),
    discontinuity() {},
    emulateStateChange(change: Ably.ChannelStateChange) {
      vi.spyOn(contributor.channel, 'state', 'get').mockReturnValue(change.current);
      vi.spyOn(contributor.channel, 'errorReason', 'get').mockReturnValue(change.reason ?? baseError);
      contributor.channelStateListeners.forEach((listener: Ably.channelEventCallback) => {
        listener(change);
      });
    },
  };
  vi.spyOn(channel, 'on').mockImplementation((listener: Ably.channelEventCallback) => {
    contributor.channelStateListeners.add(listener);
  });
  vi.spyOn(channel, 'state', 'get').mockReturnValue('detached');
  vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));

  return contributor;
};

describe('room lifecycle manager', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });

    context.firstContributor = makeMockContributor(context.realtime.channels.get('foo1'));
    context.secondContributor = makeMockContributor(context.realtime.channels.get('foo2'));
    context.thirdContributor = makeMockContributor(context.realtime.channels.get('foo3'));
  });

  describe('attachment lifecycle', () => {
    it<TestContext>('resolves to attached immediately if already attached', (context) =>
      new Promise<void>((resolve, reject) => {
        // Force our status and contributors into attached
        const status = new DefaultStatus(makeTestLogger());
        context.firstContributor.emulateStateChange({
          current: AblyChannelState.Attached,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomStatus.Attached });
        vi.spyOn(context.firstContributor.channel, 'attach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

        monitor
          .attach()
          .then(() => {
            expect(status.currentStatus).toEqual(RoomStatus.Attached);
            expect(context.firstContributor.channel.attach).not.toHaveBeenCalled();
            resolve();
          })
          .catch((error: unknown) => {
            reject(error as Error);
          });
      }));

    it<TestContext>('resolves to attached if existing attempt completes', async (context) =>
      new Promise<void>((resolve, reject) => {
        // Force our status and contributors into attached
        const status = new DefaultStatus(makeTestLogger());
        context.firstContributor.emulateStateChange({
          current: AblyChannelState.Attached,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomStatus.Attaching });
        vi.spyOn(context.firstContributor.channel, 'attach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);
        let completionTriggered = false;

        monitor
          .attach()
          .then(() => {
            expect(completionTriggered).toBeTruthy();
            expect(status.currentStatus).toEqual(RoomStatus.Attached);
            expect(context.firstContributor.channel.attach).not.toHaveBeenCalled();
            resolve();
          })
          .catch((error: unknown) => {
            reject(error as Error);
          });

        completionTriggered = true;
        status.setStatus({ status: RoomStatus.Attached });
      }));

    it<TestContext>('goes via the attaching state', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      const observedStatuses: RoomStatus[] = [];
      status.onStatusChange((newStatus) => {
        observedStatuses.push(newStatus.status);
      });

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );
      await monitor.attach();

      // We should have gone through attaching
      expect(observedStatuses).toEqual([RoomStatus.Attaching, RoomStatus.Attached]);
    });

    it<TestContext>('attaches channels in sequence', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );
      const attachResult = monitor.attach();

      // We should be in the attached state
      await waitForRoomStatus(status, RoomStatus.Attached);

      // The channel attach methods should have been called
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();

      // The attachResult should have resolved successfully
      await attachResult;
    });

    it<TestContext>('rolls back channel attachments on channel suspending', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachFailure(context.secondContributor.channel, AblyChannelState.Suspended, 1001);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // As the second channel will enter suspended, we expect a call to detach on the first channel and the second
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Attach result should reject
      await expect(monitor.attach()).rejects.toBeErrorInfoWithCode(1001);

      // We should be in the detached state because the second channel failed to attach
      await waitForRoomStatus(status, RoomStatus.Detached);

      // The third channel should not have been called as the second channel failed to attach
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).not.toHaveBeenCalled();

      // We expect both first and second channels to have had detach called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('rolls back channel attachments on channel failure', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);
      mockChannelAttachFailure(context.thirdContributor.channel, AblyChannelState.Failed, 1003);

      // As the third channel will enter failed, we expect a call to detach on the first channel and the second
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Attach result should reject
      await expect(monitor.attach()).rejects.toBeErrorInfoWithCode(1003);

      // We should be in the detached state because the second channel failed to attach
      await waitForRoomStatus(status, RoomStatus.Failed);

      // All channels should have been called
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();

      // We expect both first and second channels to have had detach called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('sets status to failed if rollback fails', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);
      mockChannelAttachFailure(context.thirdContributor.channel, AblyChannelState.Detached, 1003);

      // As the third channel will enter failed, we expect a call to detach on the first channel and the second
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachFailure(context.secondContributor.channel, AblyChannelState.Failed, 1004);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Attach result should reject - we should still get the error from the third channel
      await expect(monitor.attach()).rejects.toBeErrorInfoWithCode(1003);

      // We should be in the detached state because the second channel failed its rollback
      await waitForRoomStatus(status, RoomStatus.Failed);

      // All channels should have been called
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();

      // We expect both first and second channels to have had detach called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('ignores channel status changes during the attach cycle', async (context) => {
      vi.useFakeTimers();

      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // For the first channel, we'll do an attach that only completes after a timer has happened, so that we
      // can simulate a channel state change during the attach cycle
      vi.spyOn(context.firstContributor.channel, 'attach').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            vi.spyOn(context.firstContributor.channel, 'state', 'get').mockReturnValue(AblyChannelState.Attached);
            vi.spyOn(context.firstContributor.channel, 'errorReason', 'get').mockReturnValue(baseError);
            resolve(null);
          }, 1000);
        });
      });

      // For argument's sake, the second channel will go from suspended to attached when the attach call is made.
      mockChannelAttachSuccess(context.secondContributor.channel);

      // Observe the statuses that go by
      const observedStatuses: RoomStatus[] = [];
      status.onStatusChange((newStatus) => {
        observedStatuses.push(newStatus.status);
      });

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor],
        makeTestLogger(),
        5,
      );

      // Start the attach
      const attachPromise = monitor.attach();

      // Simulate a channel state change on the second channel
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Wait until the second contributors channel enters the suspended state
      await new Promise<void>((resolve) => {
        if (context.secondContributor.channel.state === AblyChannelState.Suspended) {
          resolve();
        }

        context.secondContributor.channel.on((change) => {
          if (change.current === AblyChannelState.Suspended) {
            resolve();
          }
        });
      });

      // Now we let the first channel complete its attach
      await vi.advanceTimersToNextTimerAsync();

      // Attach result should resolve
      await expect(attachPromise).resolves.toBeUndefined();

      // We should be in the attached state now
      await waitForRoomStatus(status, RoomStatus.Attached);

      // The states we should have seen are attaching and attached
      expect(observedStatuses).toEqual([RoomStatus.Attaching, RoomStatus.Attached]);

      // But if we suspend now, the room should go into suspended
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      await waitForRoomStatus(status, RoomStatus.Suspended);

      vi.useRealTimers();
    });
  });

  describe('detachment lifecycle', () => {
    it<TestContext>('resolves to detached immediately if already detached', async (context) => {
      // Force our status and contributors into detached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomStatus.Detached });
      vi.spyOn(context.firstContributor.channel, 'detach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await monitor.detach();
      expect(status.currentStatus).toEqual(RoomStatus.Detached);
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('rejects detach if already in failed state', async (context) => {
      // Force our status and contributors into detached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomStatus.Failed });
      vi.spyOn(context.firstContributor.channel, 'detach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.detach()).rejects.toBeErrorInfoWithCode(50000);
      expect(status.currentStatus).toEqual(RoomStatus.Failed);
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('resolves to detached if existing attempt completes', (context) =>
      new Promise<void>((resolve, reject) => {
        // Force our status and contributors into detached
        const status = new DefaultStatus(makeTestLogger());
        context.firstContributor.emulateStateChange({
          current: AblyChannelState.Detached,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomStatus.Detaching });
        vi.spyOn(context.firstContributor.channel, 'detach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);
        let completionTriggered = false;

        monitor
          .detach()
          .then(() => {
            expect(completionTriggered).toBeTruthy();
            expect(status.currentStatus).toEqual(RoomStatus.Detached);
            expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
            resolve();
          })
          .catch((error: unknown) => {
            reject(error as Error);
          });

        completionTriggered = true;
        status.setStatus({ status: RoomStatus.Detached });
      }));

    it<TestContext>('goes via the detaching state', async (context) => {
      // Force our status and contributors into detached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Initialized,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const observedStatuses: RoomStatus[] = [];
      status.onStatusChange((newStatus) => {
        observedStatuses.push(newStatus.status);
      });

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );
      await monitor.detach();

      // We should have gone through detaching
      expect(observedStatuses).toEqual([RoomStatus.Detaching, RoomStatus.Detached]);
    });

    it<TestContext>('detaches channels in sequence', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );
      await expect(monitor.detach()).resolves.toBeUndefined();

      // We should be in the detached state
      await waitForRoomStatus(status, RoomStatus.Detached);

      // The channel detach methods should have been called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('detaches all channels but enters failed state if one fails', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachFailure(context.secondContributor.channel, AblyChannelState.Failed, 1004);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      await expect(monitor.detach()).rejects.toBeErrorInfoWithCode(1004);

      // We should be in the failed state
      await waitForRoomStatus(status, RoomStatus.Failed);

      // The channel detach methods should have been called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('ignores channel status changes during the detach cycle', async (context) => {
      vi.useFakeTimers();

      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // For the first channel, we'll do a detach that only completes after a timer has happened, so that we
      // can simulate a channel state change during the detach cycle
      vi.spyOn(context.firstContributor.channel, 'detach').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            vi.spyOn(context.firstContributor.channel, 'state', 'get').mockReturnValue(AblyChannelState.Detached);
            vi.spyOn(context.firstContributor.channel, 'errorReason', 'get').mockReturnValue(baseError);
            resolve();
          }, 1000);
        });
      });

      // For argument's sake, the second channel will go from suspended to attached when the detach call is made.
      mockChannelDetachSuccess(context.secondContributor.channel);

      // Observe the statuses that go by
      const observedStatuses: RoomStatus[] = [];
      status.onStatusChange((newStatus) => {
        observedStatuses.push(newStatus.status);
      });

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor],
        makeTestLogger(),
        5,
      );

      // Start the detach
      const detachPromise = monitor.detach();

      // Simulate a channel state change on the second channel
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Wait until the second contributors channel enters the suspended state
      await new Promise<void>((resolve) => {
        if (context.secondContributor.channel.state === AblyChannelState.Suspended) {
          resolve();
        }

        context.secondContributor.channel.on((change) => {
          if (change.current === AblyChannelState.Suspended) {
            resolve();
          }
        });
      });

      // Now we let the first channel complete its detach
      await vi.advanceTimersToNextTimerAsync();

      // Detach result should resolve
      await expect(detachPromise).resolves.toBeUndefined();

      // We should be in the detached state now
      await waitForRoomStatus(status, RoomStatus.Detached);

      // The states we should have seen are detaching and detached
      expect(observedStatuses).toEqual([RoomStatus.Detaching, RoomStatus.Detached]);

      // Now if we try to attach again, we should be able to
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);

      await expect(monitor.attach()).resolves.toBeUndefined();

      // We should be in the attached state now
      await waitForRoomStatus(status, RoomStatus.Attached);

      vi.useRealTimers();
    });
  });

  describe('transient state', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it<TestContext>('handles transient detaches', (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const manager = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      // Transition the contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Transition the contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'detached',
        resumed: false,
        reason: baseError,
      });

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);
    });

    it<TestContext>('handles transient detaches with multiple contributors', (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const manager = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor],
        makeTestLogger(),
        5,
      );

      // Transition the first contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Transition the second contributor to detached
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'detached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Transition the second contributor to attached again
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'detached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);
    });

    test<TestContext>('transitions to detached when transient detach times out', (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor],
        makeTestLogger(),
        5,
      );

      // Transition the contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Detached);
      expect(status.error).toEqual(baseError);
    });

    test<TestContext>('transitions to attaching with original error if transient detach times out', (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      // Transition the contributor to detached
      const detachedError = new Ably.ErrorInfo('detached', 500, 50000);
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: detachedError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attached);

      // Now send it into attaching again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attaching,
        previous: 'detached',
        resumed: false,
        reason: baseError,
      });

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Attaching);
      expect(status.error).toEqual(detachedError);
    });
  });

  describe('non-transient state changes', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it<TestContext>('transitions to failed if an underlying channel fails', (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor],
        makeTestLogger(),
        5,
      );

      // Transition contributor two to detached to simulate a transient outage
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'attached',
        resumed: false,
        reason: baseError2,
      });

      // Transition the first contributor to failed
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Failed,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.currentStatus).toEqual(RoomStatus.Failed);
      expect(status.error).toEqual(baseError);

      // Only the second contributor should have been detached
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // The transient timeout timer for the second contributor should have been cleared, so we should still be in the failed state
      expect(status.currentStatus).toEqual(RoomStatus.Failed);
    });

    it<TestContext>('recovers from an underlying channel entering the suspended state', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // Mock channel detachment results
      mockChannelDetachNotCalled(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Mock channel re-attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Transition the first contributor to suspended
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomStatus.Suspended);

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomStatus.Attached);

      // The second and third contributors should have been detached
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();

      // All contributors should have been attached
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();
    });

    it<TestContext>('recovers from an extended period of detachment', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // Mock channel detachment results
      mockChannelDetachNotCalled(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Mock channel re-attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Transition the first contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomStatus.Detached);

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomStatus.Attached);

      // The second and third contributors should have been detached
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();

      // All contributors should have been attached
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();
    });

    it<TestContext>('recovers from a failure to re-attach other channels', async (context) => {
      // Force our status and contributors into attached
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError2,
      });
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomStatus.Attached });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachSuccess(context.secondContributor.channel);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Mock channel re-attachment results
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachFailureThenSuccess(context.secondContributor.channel, AblyChannelState.Detached, 1001);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Transition the first contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomStatus.Detached);

      let feature2AttachError: Ably.ErrorInfo | undefined;
      status.onStatusChange((newStatus) => {
        if (newStatus.status === RoomStatus.Detached) {
          feature2AttachError = newStatus.error;
        }
      });

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomStatus.Attached);

      // The first feature got detached when feature 2 failed to attach
      // The second feature got detached when feature 1 failed
      // The third feature got detached when feature 1 failed and also when 2 failed to attach
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalledTimes(2);

      // Feature 1 would have had attach called after feature 2 failed to attach
      // Feature 2 would have had attach called after feature 1 failed
      // Feature 3 would have had attach called after feature 1 failed and also after feature 2 failed to attach
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalledTimes(2);
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();

      // We should have seen feature 2's error come through during the attach sequence
      expect(feature2AttachError).toBeErrorInfoWithCode(1001);
    });
  });
});