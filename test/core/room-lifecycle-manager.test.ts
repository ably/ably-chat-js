import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, test, vi } from 'vitest';

import { ErrorCodes } from '../../src/core/errors.ts';
import { ContributesToRoomLifecycle, RoomLifecycleManager } from '../../src/core/room-lifecycle-manager.ts';
import { DefaultStatus, RoomLifecycle } from '../../src/core/room-status.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { waitForRoomStatus } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  firstContributor: MockContributor;
  secondContributor: MockContributor;
  thirdContributor: MockContributor;
}

vi.mock('ably');

interface MockContributor extends ContributesToRoomLifecycle {
  channel: Ably.RealtimeChannel;

  discontinuityDetected(): void;

  emulateStateChange: (change: Ably.ChannelStateChange, update?: boolean) => void;
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

const mockChannelAttachSuccessWithResumeFailure = (channel: Ably.RealtimeChannel, error?: Ably.ErrorInfo): void => {
  vi.spyOn(channel, 'attach').mockImplementation(() => {
    vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Attached);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(baseError);

    (
      channel as Ably.RealtimeChannel & {
        emit: (event: AblyChannelState | 'update', change: Ably.ChannelStateChange) => void;
      }
    ).emit(AblyChannelState.Attached, {
      current: AblyChannelState.Attached,
      previous: 'initialized',
      resumed: false,
      reason: error ?? baseError,
    });

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

      return Promise.reject(error);
    })
    .mockImplementationOnce(() => {
      vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Attached);
      vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(baseError);

      return Promise.resolve(null);
    });
};

const mockChannelAttachFailureThenFailed = (
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

      return Promise.reject(error);
    })
    .mockImplementationOnce(() => {
      const error2 = new Ably.ErrorInfo('error 2', 500, 50000);
      vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Failed);
      vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(error2);

      return Promise.reject(error2);
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

    return Promise.reject(error);
  });
};

const mockChannelDetachNotCalled = (channel: Ably.RealtimeChannel): void => {
  vi.spyOn(channel, 'detach').mockRejectedValue(new Error('detach should not be called'));
};

const mockChannelDetachSuccess = (channel: Ably.RealtimeChannel): void => {
  vi.spyOn(channel, 'detach').mockImplementation(() => {
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
  vi.spyOn(channel, 'detach').mockImplementation(() => {
    const error = new Ably.ErrorInfo('error', sequenceNumber, 500);
    vi.spyOn(channel, 'state', 'get').mockReturnValue(status);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(error);
    throw error;
  });
};

const mockChannelDetachFailureSucceedAfter = (
  channel: Ably.RealtimeChannel,
  status: AblyChannelState,
  sequenceNumber: number,
  succeedAfter: number,
): MockInstance => {
  // For some reason, typescript can't tell that attempts is being used
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let attempts = 0;
  const spy = vi.spyOn(channel, 'detach');

  // Mock a number of failures before we succeed
  for (let i = 0; i < succeedAfter; i++) {
    spy.mockImplementationOnce(() => {
      attempts++;
      const error = new Ably.ErrorInfo('error', sequenceNumber, 500);
      vi.spyOn(channel, 'state', 'get').mockReturnValue(status);
      vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(error);
      throw error;
    });
  }

  // Mock the success
  spy.mockImplementationOnce(() => {
    attempts++;
    vi.spyOn(channel, 'state', 'get').mockReturnValue(AblyChannelState.Detached);
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(baseError);
    return Promise.resolve();
  });

  return spy;
};

const makeMockContributor = (
  channel: Ably.RealtimeChannel,
  attachmentErrorCode: ErrorCodes,
  detachmentErrorCode: ErrorCodes,
): MockContributor => {
  const contributor = {
    channel: channel,
    discontinuityDetected() {},
    emulateStateChange(change: Ably.ChannelStateChange, update?: boolean) {
      vi.spyOn(contributor.channel, 'state', 'get').mockReturnValue(change.current);
      vi.spyOn(contributor.channel, 'errorReason', 'get').mockReturnValue(change.reason ?? baseError);

      (
        contributor.channel as Ably.RealtimeChannel & {
          emit: (event: AblyChannelState | 'update', change: Ably.ChannelStateChange) => void;
        }
      ).emit(update ? 'update' : (change.current as AblyChannelState), change);
    },
    attachmentErrorCode,
    detachmentErrorCode,
  };
  vi.spyOn(
    channel as Ably.RealtimeChannel & {
      on: (events: (AblyChannelState & 'update')[], listener: Ably.channelEventCallback) => void;
    },
    'on',
  );
  vi.spyOn(channel, 'state', 'get').mockReturnValue('initialized');
  vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));
  vi.spyOn(contributor, 'discontinuityDetected');

  return contributor;
};

// TODO: Make initial setup (into attached) and initial listener setup a method
describe('room lifecycle manager', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });

    context.firstContributor = makeMockContributor(
      context.realtime.channels.get('foo1'),
      ErrorCodes.MessagesAttachmentFailed,
      ErrorCodes.MessagesDetachmentFailed,
    );
    context.secondContributor = makeMockContributor(
      context.realtime.channels.get('foo2'),
      ErrorCodes.PresenceAttachmentFailed,
      ErrorCodes.PresenceDetachmentFailed,
    );
    context.thirdContributor = makeMockContributor(
      context.realtime.channels.get('foo3'),
      ErrorCodes.OccupancyAttachmentFailed,
      ErrorCodes.OccupancyDetachmentFailed,
    );
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
        status.setStatus({ status: RoomLifecycle.Attached });
        vi.spyOn(context.firstContributor.channel, 'attach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

        monitor
          .attach()
          .then(() => {
            expect(status.current).toEqual(RoomLifecycle.Attached);
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
        status.setStatus({ status: RoomLifecycle.Attaching });
        vi.spyOn(context.firstContributor.channel, 'attach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);
        let completionTriggered = false;

        monitor
          .attach()
          .then(() => {
            expect(completionTriggered).toBeTruthy();
            expect(status.current).toEqual(RoomLifecycle.Attached);
            expect(context.firstContributor.channel.attach).not.toHaveBeenCalled();
            resolve();
          })
          .catch((error: unknown) => {
            reject(error as Error);
          });

        completionTriggered = true;
        status.setStatus({ status: RoomLifecycle.Attached });
      }));

    it<TestContext>('fails if the room is in the released state', async (context) => {
      // Force our status into released
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomLifecycle.Released });
      vi.spyOn(context.firstContributor.channel, 'attach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.attach()).rejects.toBeErrorInfoWithCode(ErrorCodes.RoomIsReleased);
      expect(status.current).toEqual(RoomLifecycle.Released);
      expect(context.firstContributor.channel.attach).not.toHaveBeenCalled();
    });

    it<TestContext>('fails if the room is in the releasing state', async (context) => {
      // Force our status into released
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomLifecycle.Releasing });
      vi.spyOn(context.firstContributor.channel, 'attach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.attach()).rejects.toBeErrorInfoWithCode(ErrorCodes.RoomIsReleasing);
      expect(status.current).toEqual(RoomLifecycle.Releasing);
      expect(context.firstContributor.channel.attach).not.toHaveBeenCalled();
    });

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

      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        observedStatuses.push(newStatus.current);
      });

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );
      await monitor.attach();

      // We should have gone through attaching
      expect(observedStatuses).toEqual([RoomLifecycle.Attaching, RoomLifecycle.Attached]);
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
      await waitForRoomStatus(status, RoomLifecycle.Attached);

      // The channel attach methods should have been called
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();

      // The attachResult should have resolved successfully
      await attachResult;
    });

    it<TestContext>('rolls back channel attachments on channel suspending and retries', async (context) => {
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
      await expect(monitor.attach()).rejects.toBeErrorInfo({
        code: ErrorCodes.PresenceAttachmentFailed,
        cause: {
          code: 1001,
        },
      });

      // We should be in the detached state because the second channel failed to attach
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // The third channel should not have been called as the second channel failed to attach
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).not.toHaveBeenCalled();

      // We expect the first channels detach to have been called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();

      // Retry is expecting the second contributor to become attached, so we mock that - but lets make the third fail
      mockChannelAttachFailure(context.thirdContributor.channel, AblyChannelState.Suspended, 1002);
      mockChannelAttachSuccess(context.secondContributor.channel);

      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
      });

      // We should be back in suspended
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // Now let the third channel succeed
      mockChannelAttachSuccess(context.thirdContributor.channel);
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
      });

      // Now we wait for ourselves to enter the attached state
      await waitForRoomStatus(status, RoomLifecycle.Attached);
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
      await expect(monitor.attach()).rejects.toBeErrorInfo({
        code: ErrorCodes.OccupancyAttachmentFailed,
        cause: {
          code: 1003,
        },
      });

      // We should be in the failed state because the second channel failed to attach
      await waitForRoomStatus(status, RoomLifecycle.Failed);

      // All channels should have been called
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();

      // We expect both first and second channels to have had detach called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('rolls back until everything completes', async (context) => {
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

      // As the third channel will enter suspend, we expect a call to detach on the first channel and the second
      // But lets have the second detach fail
      mockChannelDetachSuccess(context.firstContributor.channel);
      const contributor2DetachSpy = mockChannelDetachFailureSucceedAfter(
        context.secondContributor.channel,
        AblyChannelState.Attached,
        1004,
        5,
      );
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      // Attach result should reject
      await expect(monitor.attach()).rejects.toBeErrorInfo({
        code: ErrorCodes.OccupancyAttachmentFailed,
        cause: {
          code: 1003,
        },
      });

      // We should be in the failed state
      await waitForRoomStatus(status, RoomLifecycle.Failed);

      // Wait until we've had a couple of attempts to detach the second channel
      await vi.waitUntil(() => contributor2DetachSpy.mock.calls.length > 5, { timeout: 5000, interval: 50 });

      // We should still be in the failed state
      await waitForRoomStatus(status, RoomLifecycle.Failed);

      // But the function calls should be correct
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).not.toHaveBeenCalled();
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
      mockChannelAttachFailure(context.thirdContributor.channel, AblyChannelState.Suspended, 1003);

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
      await expect(monitor.attach()).rejects.toBeErrorInfo({
        code: ErrorCodes.OccupancyAttachmentFailed,
        cause: {
          code: 1003,
        },
      });

      // We should be in the detached state because the second channel failed its rollback
      await waitForRoomStatus(status, RoomLifecycle.Failed);

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
      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        observedStatuses.push(newStatus.current);
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
      await waitForRoomStatus(status, RoomLifecycle.Attached);

      // The states we should have seen are attaching and attached
      expect(observedStatuses).toEqual([RoomLifecycle.Attaching, RoomLifecycle.Attached]);

      // But if we suspend now, the room should go into suspended
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      await waitForRoomStatus(status, RoomLifecycle.Suspended);

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
      status.setStatus({ status: RoomLifecycle.Detached });
      vi.spyOn(context.firstContributor.channel, 'detach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await monitor.detach();
      expect(status.current).toEqual(RoomLifecycle.Detached);
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
      status.setStatus({ status: RoomLifecycle.Failed });
      vi.spyOn(context.firstContributor.channel, 'detach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.detach()).rejects.toBeErrorInfoWithCode(ErrorCodes.RoomInFailedState);
      expect(status.current).toEqual(RoomLifecycle.Failed);
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
        status.setStatus({ status: RoomLifecycle.Detaching });
        vi.spyOn(context.firstContributor.channel, 'detach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);
        let completionTriggered = false;

        monitor
          .detach()
          .then(() => {
            expect(completionTriggered).toBeTruthy();
            expect(status.current).toEqual(RoomLifecycle.Detached);
            expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
            resolve();
          })
          .catch((error: unknown) => {
            reject(error as Error);
          });

        completionTriggered = true;
        status.setStatus({ status: RoomLifecycle.Detached });
      }));

    it<TestContext>('fails if the room is in the released state', async (context) => {
      // Force our status into released
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomLifecycle.Released });
      vi.spyOn(context.firstContributor.channel, 'detach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.detach()).rejects.toBeErrorInfoWithCode(ErrorCodes.RoomIsReleased);
      expect(status.current).toEqual(RoomLifecycle.Released);
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('fails if the room is in the releasing state', async (context) => {
      // Force our status into released
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomLifecycle.Releasing });
      vi.spyOn(context.firstContributor.channel, 'detach');

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.detach()).rejects.toBeErrorInfoWithCode(ErrorCodes.RoomIsReleasing);
      expect(status.current).toEqual(RoomLifecycle.Releasing);
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
    });

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

      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        observedStatuses.push(newStatus.current);
      });

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );
      await monitor.detach();

      // We should have gone through detaching
      expect(observedStatuses).toEqual([RoomLifecycle.Detaching, RoomLifecycle.Detached]);
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
      await waitForRoomStatus(status, RoomLifecycle.Detached);

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

      await expect(monitor.detach()).rejects.toBeErrorInfo({
        code: ErrorCodes.PresenceDetachmentFailed,
        cause: {
          code: 1004,
        },
      });

      // We should be in the failed state
      await waitForRoomStatus(status, RoomLifecycle.Failed);

      // The channel detach methods should have been called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();
    });

    it<TestContext>('keeps detaching until everything completes', async (context) => {
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
      const secondContributorSpy = mockChannelDetachFailureSucceedAfter(
        context.secondContributor.channel,
        AblyChannelState.Attached,
        1004,
        5,
      );
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      await expect(monitor.detach()).resolves.toBeUndefined();

      // We should be in the detached state
      await waitForRoomStatus(status, RoomLifecycle.Detached);

      // Wait for our second channel to have had a few attempts to detach
      await vi.waitUntil(() => secondContributorSpy.mock.calls.length > 5, { timeout: 5000, interval: 50 });

      // The channel detach methods should have been called
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      // 5 + the final success
      expect(context.secondContributor.channel.detach).toHaveBeenCalledTimes(6);
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
      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        observedStatuses.push(newStatus.current);
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
      await waitForRoomStatus(status, RoomLifecycle.Detached);

      // The states we should have seen are detaching and detached
      expect(observedStatuses).toEqual([RoomLifecycle.Detaching, RoomLifecycle.Detached]);

      // Now if we try to attach again, we should be able to
      mockChannelAttachSuccess(context.firstContributor.channel);
      mockChannelAttachSuccess(context.secondContributor.channel);

      await expect(monitor.attach()).resolves.toBeUndefined();

      // We should be in the attached state now
      await waitForRoomStatus(status, RoomLifecycle.Attached);

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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      expect(status.current).toEqual(RoomLifecycle.Attached);

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
      expect(status.current).toEqual(RoomLifecycle.Attached);
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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      expect(status.current).toEqual(RoomLifecycle.Attached);

      // Transition the second contributor to detached
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.current).toEqual(RoomLifecycle.Attached);

      // Transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'detached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.current).toEqual(RoomLifecycle.Attached);

      // Transition the second contributor to attached again
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'detached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      expect(status.current).toEqual(RoomLifecycle.Attached);

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // Check that the status is as expected
      expect(status.current).toEqual(RoomLifecycle.Attached);
    });

    // Transient detach is where the channel goes back to attaching as a result of a DETACHED protocol message
    test<TestContext>('transitions to attaching when transient detach times out', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor],
        makeTestLogger(),
        5,
      );

      // Transition the contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attaching,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });

      // We should still be in the attached state
      expect(status.current).toEqual(RoomLifecycle.Attached);

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Attaching);
      expect(status.error).toEqual(baseError);
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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      expect(status.current).toEqual(RoomLifecycle.Failed);
      expect(status.error).toEqual(baseError);

      // Only the second contributor should have been detached
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();

      // Expire any fake timers
      vi.advanceTimersToNextTimer();

      // The transient timeout timer for the second contributor should have been cleared, so we should still be in the failed state
      expect(status.current).toEqual(RoomLifecycle.Failed);
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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Attached);

      // The second and third contributors should have been detached
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();

      // All contributors should have been attached
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).toHaveBeenCalled();
    });

    it<TestContext>('recovers from a re-attachment cycle without detaching channels', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

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

      // Transition the first contributor to attaching
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attaching,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Attaching);

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Attached);

      // We shouldn't have detached anything, as we're actively trying to re-attach
      expect(context.firstContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).not.toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).not.toHaveBeenCalled();

      // We also shouldn't have attached anything, as we're already attached
      expect(context.firstContributor.channel.attach).not.toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).not.toHaveBeenCalled();
      expect(context.thirdContributor.channel.attach).not.toHaveBeenCalled();
    });

    it<TestContext>('recovers from a suspended channel via retries', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      mockChannelAttachFailureThenSuccess(context.secondContributor.channel, AblyChannelState.Suspended, 1001);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Observations
      let feature2AttachError: Ably.ErrorInfo | undefined;
      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        if (newStatus.current === RoomLifecycle.Suspended) {
          feature2AttachError = newStatus.error;
        }

        observedStatuses.push(newStatus.current);
      });

      // Transition the first contributor to detached
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // We should be in attached state
      await waitForRoomStatus(status, RoomLifecycle.Attached);

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
      expect(feature2AttachError).toBeErrorInfo({
        code: ErrorCodes.PresenceAttachmentFailed,
        cause: {
          code: 1001,
        },
      });

      // We should have seen a sequence of statuses
      expect(observedStatuses).toEqual([
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Attached,
      ]);
    });

    it<TestContext>('recovers from a suspended channel via many retries', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      mockChannelAttachFailure(context.secondContributor.channel, AblyChannelState.Suspended, 1001);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Observations
      let feature1AttachError: Ably.ErrorInfo | undefined;
      let feature2AttachError: Ably.ErrorInfo | undefined;
      let feature3AttachError: Ably.ErrorInfo | undefined;
      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        observedStatuses.push(newStatus.current);

        if (newStatus.current === RoomLifecycle.Suspended && !feature1AttachError) {
          feature1AttachError = newStatus.error;
          return;
        }

        if (newStatus.current === RoomLifecycle.Suspended && !feature2AttachError) {
          feature2AttachError = newStatus.error;
          return;
        }

        if (newStatus.current === RoomLifecycle.Suspended && !feature3AttachError) {
          feature3AttachError = newStatus.error;
          return;
        }
      });

      // Transition the first contributor to suspended
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      const seenAttaching = new Promise<void>((resolve, reject) => {
        status.onChangeOnce((newStatus) => {
          if (newStatus.current === RoomLifecycle.Attaching) {
            resolve();
          }

          if (newStatus.current === RoomLifecycle.Failed) {
            reject(new Error('Failed to transition to attaching'));
          }
        });
      });

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      await seenAttaching;

      // We should be in suspended state, because the  second contributor failed to attach
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // Now for arguments sake, the third contributor fails to attach
      mockChannelAttachFailure(context.thirdContributor.channel, AblyChannelState.Suspended, 1001);
      mockChannelAttachSuccess(context.secondContributor.channel);

      const seenAttachingAgain = new Promise<void>((resolve, reject) => {
        status.onChangeOnce((newStatus) => {
          if (newStatus.current === RoomLifecycle.Attaching) {
            resolve();
          }

          if (newStatus.current === RoomLifecycle.Failed) {
            reject(new Error('Failed to transition to attaching'));
          }
        });
      });

      // Now transition the second contributor to attached again
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError2,
      });

      await seenAttachingAgain;

      // We should still suspended, because the third contributor failed to attach
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // One last time, the third contributor will succeed
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Now transition the third contributor to attached again
      context.thirdContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // We should be in attached state
      await waitForRoomStatus(status, RoomLifecycle.Attached);

      // The first feature got detached when feature 2 failed to attach and when feature 3 failed to attach
      // The second feature got detached when feature 1 failed to attach and when feature 3 failed to attach
      // The third feature got detached when feature 1 failed to attach and when feature 2 failed to attach
      expect(context.firstContributor.channel.detach).toHaveBeenCalledTimes(2);
      expect(context.secondContributor.channel.detach).toHaveBeenCalledTimes(2);
      expect(context.thirdContributor.channel.detach).toHaveBeenCalledTimes(2);

      // Feature 1 would have had attach called after feature 2's failure, feature 3's failure, and in the final run
      // Feature 2 would have had attach called after in its own failure, and feature 3's failure (feature 1's is hidden by a mock reset)
      // Feature 3 would have had attach called after feature 1 failed and also after feature 2 failed to attach
      expect(context.firstContributor.channel.attach).toHaveBeenCalledTimes(3);
      expect(context.secondContributor.channel.attach).toHaveBeenCalledTimes(2);
      expect(context.thirdContributor.channel.attach).toHaveBeenCalledOnce();

      // Feature 1's error should be the first one we saw
      expect(feature1AttachError).toBeErrorInfo({
        code: 500,
      });

      // We should have seen feature 2's error come through during the attach sequence
      expect(feature2AttachError).toBeErrorInfo({
        code: ErrorCodes.PresenceAttachmentFailed,
        cause: {
          code: 1001,
        },
      });

      // We should have seen feature 3's error come through during the attach sequence
      expect(feature3AttachError).toBeErrorInfo({
        code: ErrorCodes.OccupancyAttachmentFailed,
        cause: {
          code: 1001,
        },
      });

      // We should have seen a sequence of statuses
      expect(observedStatuses).toEqual([
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Attached,
      ]);
    });

    it<TestContext>('enters failed if a contributor fails during retry', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

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
      mockChannelAttachFailureThenFailed(context.secondContributor.channel, AblyChannelState.Suspended, 1001);
      mockChannelAttachSuccess(context.thirdContributor.channel);

      // Observations
      let feature2AttachError: Ably.ErrorInfo | undefined;
      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        if (newStatus.current === RoomLifecycle.Suspended) {
          feature2AttachError = newStatus.error;
        }

        observedStatuses.push(newStatus.current);
      });

      // Transition the first contributor to suspended
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Suspended,
        previous: 'attached',
        resumed: false,
        reason: baseError,
      });

      // Check that the status is as expected
      await waitForRoomStatus(status, RoomLifecycle.Suspended);

      // Now transition the first contributor to attached again
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'suspended',
        resumed: false,
        reason: baseError,
      });

      // We should be in failed state
      await waitForRoomStatus(status, RoomLifecycle.Failed);

      // The first feature got detached when feature 2 failed to attach
      // The second feature got detached when feature 1 failed
      // The third feature got detached when feature 1 failed and also when 2 failed to attach
      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalledTimes(3);

      // Feature 1 would have had attach called after feature 2 failed to attach
      // Feature 2 would have had attach called after feature 1 failed
      // Feature 3 never got to attach
      expect(context.firstContributor.channel.attach).toHaveBeenCalled();
      expect(context.secondContributor.channel.attach).toHaveBeenCalledTimes(2);
      expect(context.thirdContributor.channel.attach).not.toHaveBeenCalled();

      // We should have seen feature 2's error come through during the attach sequence
      expect(feature2AttachError).toBeErrorInfo({
        code: ErrorCodes.PresenceAttachmentFailed,
        cause: {
          code: 1001,
        },
      });

      // We should have seen a sequence of statuses
      expect(observedStatuses).toEqual([
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Suspended,
        RoomLifecycle.Attaching,
        RoomLifecycle.Failed,
      ]);

      // Send contributor 2 into attached
      context.secondContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'failed',
        resumed: false,
        reason: baseError2,
      });

      // We still should be in failed state - we've given up trying
      await waitForRoomStatus(status, RoomLifecycle.Failed);
    });
  });

  describe('discontinuity handling', () => {
    describe('via update', () => {
      it<TestContext>('ignores a discontinuity event if the channel never made it to attached', async (context) => {
        // Force our status and contributors into initialized
        const status = new DefaultStatus(makeTestLogger());
        context.firstContributor.emulateStateChange({
          current: AblyChannelState.Initialized,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomLifecycle.Initialized });

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

        // Send the monitor through the attach cycle, but lets fail the attach
        mockChannelAttachFailure(context.firstContributor.channel, AblyChannelState.Suspended, 1001);
        mockChannelDetachSuccess(context.firstContributor.channel);

        await expect(monitor.attach()).rejects.toBeErrorInfo({
          code: ErrorCodes.MessagesAttachmentFailed,
          cause: { code: 1001 },
        });

        // Emit an update / discontinuity event on the first contributor (for arguments sake)
        context.firstContributor.emulateStateChange(
          {
            current: AblyChannelState.Attached,
            previous: AblyChannelState.Initialized,
            resumed: false,
            reason: baseError,
          },
          true,
        );

        // Our status should be detached
        expect(status.current).toEqual(RoomLifecycle.Suspended);

        // We should not have seen a discontinuity event
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();

        // Now try to attach again
        mockChannelAttachSuccess(context.firstContributor.channel);
        await monitor.attach();

        // Our status should be attached
        expect(status.current).toEqual(RoomLifecycle.Attached);

        // But we still shouldn't have seen a discontinuity event
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();
      });

      it<TestContext>('registers a discontinuity event immediately if fully attached and an update event is received', async (context) => {
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
        status.setStatus({ status: RoomLifecycle.Initialized });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const monitor = new RoomLifecycleManager(
          status,
          [context.firstContributor, context.secondContributor, context.thirdContributor],
          makeTestLogger(),
          5,
        );

        // Sent the monitor through the attach cycle
        mockChannelAttachSuccess(context.firstContributor.channel);
        mockChannelAttachSuccess(context.secondContributor.channel);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        await monitor.attach();

        // Emit an update / discontinuity event on the first contributor
        context.firstContributor.emulateStateChange(
          {
            current: AblyChannelState.Attached,
            previous: AblyChannelState.Attached,
            resumed: false,
            reason: baseError,
          },
          true,
        );

        // Our first contributor should have registered a discontinuity event
        expect(status.current).toEqual(RoomLifecycle.Attached);
        expect(context.firstContributor.discontinuityDetected).toBeCalledWith(baseError);
      });

      it<TestContext>('registers a discontinuity after re-attachment if room is detached at the time', async (context) => {
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
        status.setStatus({ status: RoomLifecycle.Initialized });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const monitor = new RoomLifecycleManager(
          status,
          [context.firstContributor, context.secondContributor, context.thirdContributor],
          makeTestLogger(),
          5,
        );

        // Send the monitor through the attach cycle
        mockChannelAttachSuccess(context.firstContributor.channel);
        mockChannelAttachSuccess(context.secondContributor.channel);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        await monitor.attach();

        // Send the monitor through the detach cycle
        mockChannelDetachSuccess(context.firstContributor.channel);
        mockChannelDetachSuccess(context.secondContributor.channel);
        mockChannelDetachSuccess(context.thirdContributor.channel);

        await monitor.detach();

        // Emit an update / discontinuity event on the first contributor during the detached state for whatever reason
        context.firstContributor.emulateStateChange(
          {
            current: AblyChannelState.Attached,
            previous: AblyChannelState.Attached,
            resumed: false,
            reason: baseError,
          },
          true,
        );

        // We shouldn't have registered a discontinuity event yet
        expect(status.current).toEqual(RoomLifecycle.Detached);
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();

        // Now re-attach the room
        await monitor.attach();

        // Our first contributor should have registered a discontinuity event now
        expect(status.current).toEqual(RoomLifecycle.Attached);
        expect(context.firstContributor.discontinuityDetected).toBeCalledWith(baseError);
      });

      it<TestContext>('should prefer the first discontinuity event if multiple are received', async (context) => {
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
        status.setStatus({ status: RoomLifecycle.Initialized });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const monitor = new RoomLifecycleManager(
          status,
          [context.firstContributor, context.secondContributor, context.thirdContributor],
          makeTestLogger(),
          5,
        );

        // Send the monitor through the attach cycle
        mockChannelAttachSuccess(context.firstContributor.channel);
        mockChannelAttachSuccess(context.secondContributor.channel);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        await monitor.attach();

        // Send the monitor through the detach cycle
        mockChannelDetachSuccess(context.firstContributor.channel);
        mockChannelDetachSuccess(context.secondContributor.channel);
        mockChannelDetachSuccess(context.thirdContributor.channel);

        await monitor.detach();

        // Emit an update / discontinuity event on the first contributor during the detached state for whatever reason
        const error1 = new Ably.ErrorInfo('first', 1, 1);
        context.firstContributor.emulateStateChange(
          {
            current: AblyChannelState.Attached,
            previous: AblyChannelState.Attached,
            resumed: false,
            reason: error1,
          },
          true,
        );

        // Now do another
        context.firstContributor.emulateStateChange(
          {
            current: AblyChannelState.Attached,
            previous: AblyChannelState.Attached,
            resumed: false,
            reason: baseError,
          },
          true,
        );

        // We shouldn't have registered a discontinuity event yet
        expect(status.current).toEqual(RoomLifecycle.Detached);
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();

        // Now re-attach the room
        await monitor.attach();

        // Our first contributor should have registered a discontinuity event now
        expect(status.current).toEqual(RoomLifecycle.Attached);
        expect(context.firstContributor.discontinuityDetected).toBeCalledWith(error1);
      });
    });

    describe('via attach event', () => {
      it<TestContext>('does not register a discontinuity event on initial attach', async (context) => {
        const status = new DefaultStatus(makeTestLogger());
        context.firstContributor.emulateStateChange({
          current: AblyChannelState.Initialized,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomLifecycle.Initialized });

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

        // Send the monitor through the attach cycle
        mockChannelAttachSuccess(context.firstContributor.channel);

        await monitor.attach();

        // We shouldn't have registered a discontinuity event
        expect(status.current).toEqual(RoomLifecycle.Attached);
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();
      });

      it<TestContext>('registers a discontinuity immediately post-attach if one of the attach events was a failed resume', async (context) => {
        // Force our status and contributors into initialized
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
          reason: baseError2,
        });
        context.thirdContributor.emulateStateChange({
          current: AblyChannelState.Initialized,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomLifecycle.Initialized });

        const monitor = new RoomLifecycleManager(
          status,
          [context.firstContributor, context.secondContributor, context.thirdContributor],
          makeTestLogger(),
          5,
        );

        // Send the monitor through the attach cycle
        mockChannelAttachSuccess(context.firstContributor.channel);
        mockChannelAttachSuccess(context.secondContributor.channel);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        await monitor.attach();

        // Send the monitor through the detach cycle
        mockChannelDetachSuccess(context.firstContributor.channel);
        mockChannelDetachSuccess(context.secondContributor.channel);
        mockChannelDetachSuccess(context.thirdContributor.channel);

        await monitor.detach();

        // There should be no discontinuity event yet
        expect(status.current).toEqual(RoomLifecycle.Detached);
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();

        // Now do a re-attach, but make the first channel fail to resume
        mockChannelAttachSuccessWithResumeFailure(context.firstContributor.channel);

        // Now re-attach the room
        await monitor.attach();

        // Our first contributor should have registered a discontinuity event now
        expect(status.current).toEqual(RoomLifecycle.Attached);
        expect(context.firstContributor.discontinuityDetected).toBeCalledWith(baseError);
      });

      it<TestContext>('prefers the first discontinuity event if multiple are received', async (context) => {
        // Force our status and contributors into initialized
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
          reason: baseError2,
        });
        context.thirdContributor.emulateStateChange({
          current: AblyChannelState.Initialized,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomLifecycle.Initialized });

        const monitor = new RoomLifecycleManager(
          status,
          [context.firstContributor, context.secondContributor, context.thirdContributor],
          makeTestLogger(),
          5,
        );

        // Send the monitor through the attach cycle
        mockChannelAttachSuccess(context.firstContributor.channel);
        mockChannelAttachSuccess(context.secondContributor.channel);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        await monitor.attach();

        // Send the monitor through the detach cycle
        mockChannelDetachSuccess(context.firstContributor.channel);
        mockChannelDetachSuccess(context.secondContributor.channel);
        mockChannelDetachSuccess(context.thirdContributor.channel);

        await monitor.detach();

        // There should be no discontinuity event yet
        expect(status.current).toEqual(RoomLifecycle.Detached);
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();

        // Now we attach again, but fail the second channel so we get a detach event
        const firstError = new Ably.ErrorInfo('first', 1, 1);
        mockChannelAttachSuccessWithResumeFailure(context.firstContributor.channel, firstError);
        mockChannelAttachFailure(context.secondContributor.channel, AblyChannelState.Suspended, 1001);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        // Now re-attach the room, it should reject with the error
        await expect(monitor.attach()).rejects.toBeErrorInfo({
          code: ErrorCodes.PresenceAttachmentFailed,
          cause: {
            code: 1001,
          },
        });

        // We should be suspended
        expect(status.current).toEqual(RoomLifecycle.Suspended);

        // And still no discontinuity event
        expect(context.firstContributor.discontinuityDetected).not.toHaveBeenCalled();

        // Now we attach in full with a second resume fail
        const secondError = new Ably.ErrorInfo('second', 2, 2);
        mockChannelAttachSuccessWithResumeFailure(context.firstContributor.channel, secondError);
        mockChannelAttachSuccess(context.secondContributor.channel);
        mockChannelAttachSuccess(context.thirdContributor.channel);

        // Now we'll transition channel 2 back into attached to complete the attach
        context.secondContributor.emulateStateChange({
          current: AblyChannelState.Attached,
          previous: AblyChannelState.Initialized,
          resumed: false,
          reason: baseError2,
        });

        // We should be attached
        await waitForRoomStatus(status, RoomLifecycle.Attached);

        // Our first contributor should have registered a discontinuity event now
        expect(status.current).toEqual(RoomLifecycle.Attached);
        expect(context.firstContributor.discontinuityDetected).toBeCalledWith(firstError);
      });
    });
  });

  describe('release lifecycle', () => {
    it<TestContext>('resolves immediately if the room is already released', async (context) => {
      const status = new DefaultStatus(makeTestLogger());
      status.setStatus({ status: RoomLifecycle.Released });

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.release()).resolves.toBeUndefined();
    });

    it<TestContext>('resolves immediately and transitions to released if the room is detached', async (context) => {
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Detached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomLifecycle.Detached });

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      await expect(monitor.release()).resolves.toBeUndefined();

      await waitForRoomStatus(status, RoomLifecycle.Released);
    });

    it<TestContext>('resolves to released if existing attempt completes', (context) =>
      new Promise<void>((resolve, reject) => {
        vi.useFakeTimers();

        // Force our status and contributors into detached
        const status = new DefaultStatus(makeTestLogger());
        context.firstContributor.emulateStateChange({
          current: AblyChannelState.Attached,
          previous: 'initialized',
          resumed: false,
          reason: baseError,
        });
        status.setStatus({ status: RoomLifecycle.Releasing });
        vi.spyOn(context.firstContributor.channel, 'detach');

        const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);
        let completionTriggered = false;

        // Make it so that the first contributor only detaches when a timer expires
        vi.spyOn(context.firstContributor.channel, 'detach').mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve();
              }, 100);
            }),
        );

        // Release the room
        void monitor.release();

        monitor
          .release()
          .then(() => {
            expect(completionTriggered).toBeTruthy();
            expect(status.current).toEqual(RoomLifecycle.Released);
            expect(context.firstContributor.channel.detach).toHaveBeenCalledOnce();
            resolve();
          })
          .catch((error: unknown) => {
            reject(error as Error);
          });

        // Expire the fake timer to trigger the completion
        completionTriggered = true;
        vi.advanceTimersToNextTimer();

        vi.useRealTimers();
      }));

    it<TestContext>('transitions via releasing', async (context) => {
      const status = new DefaultStatus(makeTestLogger());
      context.firstContributor.emulateStateChange({
        current: AblyChannelState.Attached,
        previous: 'initialized',
        resumed: false,
        reason: baseError,
      });
      status.setStatus({ status: RoomLifecycle.Attached });

      const monitor = new RoomLifecycleManager(status, [context.firstContributor], makeTestLogger(), 5);

      const observedStatuses: RoomLifecycle[] = [];
      status.onChange((newStatus) => {
        observedStatuses.push(newStatus.current);
      });

      await monitor.release();

      expect(observedStatuses).toEqual([RoomLifecycle.Releasing, RoomLifecycle.Released]);
    });

    it<TestContext>('detaches all contributors during release', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

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

      await expect(monitor.release()).resolves.toBeUndefined();

      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();

      expect(status.current).toEqual(RoomLifecycle.Released);
    });

    it<TestContext>('allows channels detaching into failed', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachFailure(context.secondContributor.channel, AblyChannelState.Failed, 1001);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      await expect(monitor.release()).resolves.toBeUndefined();

      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalled();
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();

      expect(status.current).toEqual(RoomLifecycle.Released);
    });

    it<TestContext>('allows channels detaching into suspended', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      vi.spyOn(context.secondContributor.channel, 'detach')
        .mockImplementationOnce(() => {
          vi.spyOn(context.secondContributor.channel, 'state', 'get').mockReturnValue(AblyChannelState.Suspended);
          return Promise.reject(new Ably.ErrorInfo('failed', 1001, 1001));
        })
        .mockImplementationOnce(() => {
          vi.spyOn(context.secondContributor.channel, 'state', 'get').mockReturnValue(AblyChannelState.Detached);
          return Promise.resolve();
        });
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      await expect(monitor.release()).resolves.toBeUndefined();

      expect(context.firstContributor.channel.detach).toHaveBeenCalledOnce();
      expect(context.secondContributor.channel.detach).toHaveBeenCalledTimes(2);
      expect(context.thirdContributor.channel.detach).toHaveBeenCalledOnce();

      expect(status.current).toEqual(RoomLifecycle.Released);
    });

    it<TestContext>('continues to run the detach cycle until a resolution is reached', async (context) => {
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
      status.setStatus({ status: RoomLifecycle.Attached });

      // Mock channel detachment results
      mockChannelDetachSuccess(context.firstContributor.channel);
      mockChannelDetachFailureSucceedAfter(context.secondContributor.channel, AblyChannelState.Attached, 1001, 5);
      mockChannelDetachSuccess(context.thirdContributor.channel);

      const monitor = new RoomLifecycleManager(
        status,
        [context.firstContributor, context.secondContributor, context.thirdContributor],
        makeTestLogger(),
        5,
      );

      await expect(monitor.release()).resolves.toBeUndefined();

      expect(context.firstContributor.channel.detach).toHaveBeenCalled();
      expect(context.secondContributor.channel.detach).toHaveBeenCalledTimes(6);
      expect(context.thirdContributor.channel.detach).toHaveBeenCalled();

      expect(status.current).toEqual(RoomLifecycle.Released);
    });
  });
});
