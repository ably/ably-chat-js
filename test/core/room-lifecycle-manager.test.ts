import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../../src/core/channel-manager.js';
import { ErrorCode } from '../../src/core/errors.js';
import { Logger } from '../../src/core/logger.js';
import { RoomLifecycleManager } from '../../src/core/room-lifecycle-manager.js';
import { DefaultRoomLifecycle, InternalRoomLifecycle, RoomStatus } from '../../src/core/room-status.js';
import { ErrorInfoCompareType } from '../helper/expectations.js';
import { makeTestLogger } from '../helper/logger.js';

interface TestContext {
  roomLifeCycleManager: RoomLifecycleManager;
  channelManager: ChannelManager;
  roomStatus: InternalRoomLifecycle;
  logger: Logger;
  mockChannel: Partial<Ably.RealtimeChannel> & {
    attach: () => Promise<Ably.ChannelStateChange | null>;
    detach?: () => Promise<Ably.ChannelStateChange | null>;
    on?: (event: string | string[], handler: (stateChange: Ably.ChannelStateChange) => void) => void;
    off?: (event?: string | string[], handler?: (stateChange: Ably.ChannelStateChange) => void) => void;
    _stateChangeHandlers: Map<Ably.ChannelEvent, ((stateChange: Ably.ChannelStateChange) => void)[]>;
    _stateChangeHandlersForAll: ((stateChange: Ably.ChannelStateChange) => void)[];
    invokeStateChange: (stateChange: Ably.ChannelStateChange, isUpdate?: boolean) => void;
  };
}

vi.mock('ably');

describe('RoomLifecycleManager', () => {
  beforeEach<TestContext>((context) => {
    const logger = makeTestLogger();

    context.mockChannel = {
      attach: vi.fn().mockImplementation(() => Promise.resolve(null)),
      detach: vi.fn().mockImplementation(() => Promise.resolve(null)),
      state: 'initialized',
      invokeStateChange: (stateChange: Ably.ChannelStateChange, isUpdate = false) => {
        for (const handler of context.mockChannel._stateChangeHandlersForAll) {
          handler(stateChange);
        }

        const handlers = isUpdate
          ? context.mockChannel._stateChangeHandlers.get('update')
          : context.mockChannel._stateChangeHandlers.get(stateChange.current);
        if (!handlers) {
          return;
        }

        for (const handler of handlers) {
          handler(stateChange);
        }
      },
      _stateChangeHandlers: new Map<Ably.ChannelEvent, ((stateChange: Ably.ChannelStateChange) => void)[]>(),
      _stateChangeHandlersForAll: [],
      on: vi
        .fn()
        .mockImplementation(
          (event: Ably.ChannelEvent | Ably.ChannelEvent[], handler: (stateChange: Ably.ChannelStateChange) => void) => {
            if (typeof event === 'string') {
              event = [event];
            } else if (typeof event === 'function') {
              context.mockChannel._stateChangeHandlersForAll.push(
                event as unknown as (stateChange: Ably.ChannelStateChange) => void,
              );
              return;
            }

            for (const e of event) {
              if (!context.mockChannel._stateChangeHandlers.has(e)) {
                context.mockChannel._stateChangeHandlers.set(e, []);
              }

              context.mockChannel._stateChangeHandlers
                .get(e)
                ?.push(
                  Array.isArray(event) ? handler : (event as unknown as (stateChange: Ably.ChannelStateChange) => void),
                );
            }
          },
        ),
      off: vi.fn(),
    };

    context.channelManager = {
      get: vi.fn().mockReturnValue(context.mockChannel as Ably.RealtimeChannel),
      release: vi.fn(),
    } as unknown as ChannelManager;

    context.roomStatus = new DefaultRoomLifecycle(logger);
    context.logger = logger;
    context.roomLifeCycleManager = new RoomLifecycleManager(context.channelManager, context.roomStatus, context.logger);
  });

  describe('attach', () => {
    it<TestContext>('should be a no-op if room is already attached', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });

      // Act
      await roomLifeCycleManager.attach();

      // Assert
      expect(mockChannel.attach).not.toHaveBeenCalled();
    });

    it<TestContext>('should throw error if room is released', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Released });

      // Act & Assert
      await expect(roomLifeCycleManager.attach()).rejects.toBeErrorInfo({
        message: 'cannot attach room, room is released',
        code: ErrorCode.RoomIsReleased,
        statusCode: 400,
      });
      expect(mockChannel.attach).not.toHaveBeenCalled();
    });

    it<TestContext>('should throw error if room is releasing', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Releasing });

      // Act & Assert
      await expect(roomLifeCycleManager.attach()).rejects.toBeErrorInfo({
        message: 'cannot attach room, room is currently releasing',
        code: ErrorCode.RoomIsReleasing,
        statusCode: 400,
      });
      expect(mockChannel.attach).not.toHaveBeenCalled();
    });

    it<TestContext>('should successfully attach and update status', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Initialized });

      // Act
      await roomLifeCycleManager.attach();

      // Assert
      expect(mockChannel.attach).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Attached);
    });

    it<TestContext>('should handle Ably errors during attach', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      const ablyError = new Ably.ErrorInfo('attach failed', 12345, 400);
      vi.spyOn(mockChannel, 'attach').mockRejectedValue(ablyError);
      vi.spyOn(mockChannel, 'state', 'get').mockReturnValue('failed');

      // Act & Assert
      await expect(roomLifeCycleManager.attach()).rejects.toBeErrorInfo({
        message: 'failed to attach room: attach failed',
        code: 12345,
        statusCode: 400,
        cause: ablyError as ErrorInfoCompareType,
      });

      expect(roomStatus.status).toBe(RoomStatus.Failed);
      expect(roomStatus.error).toBeErrorInfo({
        message: 'failed to attach room: attach failed',
        code: 12345,
        statusCode: 400,
        cause: ablyError as ErrorInfoCompareType,
      });
    });
  });

  describe('detach', () => {
    it<TestContext>('should be a no-op if room is already detached', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Detached });

      // Act
      await roomLifeCycleManager.detach();

      // Assert
      expect(mockChannel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('should throw error if room is in failed state', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Failed });

      // Act & Assert
      await expect(roomLifeCycleManager.detach()).rejects.toBeErrorInfo({
        message: 'cannot detach room, room is in failed state',
        code: ErrorCode.RoomInFailedState,
        statusCode: 400,
      });
      expect(mockChannel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('should throw error if room is released', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Released });

      // Act & Assert
      await expect(roomLifeCycleManager.detach()).rejects.toBeErrorInfo({
        message: 'cannot detach room, room is released',
        code: ErrorCode.RoomIsReleased,
        statusCode: 400,
      });
      expect(mockChannel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('should throw error if room is releasing', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Releasing });

      // Act & Assert
      await expect(roomLifeCycleManager.detach()).rejects.toBeErrorInfo({
        message: 'cannot detach room, room is currently releasing',
        code: ErrorCode.RoomIsReleasing,
        statusCode: 400,
      });
      expect(mockChannel.detach).not.toHaveBeenCalled();
    });

    it<TestContext>('should successfully detach and update status', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });
      mockChannel.detach = vi.fn().mockImplementation(() => Promise.resolve(null));

      // Act
      await roomLifeCycleManager.detach();

      // Assert
      expect(mockChannel.detach).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Detached);
    });

    it<TestContext>('should handle Ably errors during detach', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      const ablyError = new Ably.ErrorInfo('detach failed', 12345, 400);
      mockChannel.detach = vi.fn().mockRejectedValue(ablyError);
      vi.spyOn(mockChannel, 'state', 'get').mockReturnValue('failed');

      // Act & Assert
      await expect(roomLifeCycleManager.detach()).rejects.toBeErrorInfo({
        message: 'failed to detach room: detach failed',
        code: 12345,
        statusCode: 400,
        cause: ablyError as ErrorInfoCompareType,
      });
      expect(roomStatus.status).toBe(RoomStatus.Failed);
      expect(roomStatus.error).toBeErrorInfo({
        message: 'failed to detach room: detach failed',
        code: 12345,
        statusCode: 400,
        cause: ablyError as ErrorInfoCompareType,
      });
    });
  });

  describe('release', () => {
    it<TestContext>('should be a no-op if room is already released', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
      channelManager,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Released });

      // Act
      await roomLifeCycleManager.release();

      // Assert
      expect(mockChannel.detach).not.toHaveBeenCalled();
      expect(channelManager.release).not.toHaveBeenCalled();
      expect(roomStatus.status).toBe(RoomStatus.Released);
    });

    it<TestContext>('should immediately release if room is initialized', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
      channelManager,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Initialized });

      // Act
      await roomLifeCycleManager.release();

      // Assert
      expect(mockChannel.detach).not.toHaveBeenCalled();
      expect(channelManager.release).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Released);
    });

    it<TestContext>('should immediately release if room is detached', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
      channelManager,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Detached });

      // Act
      await roomLifeCycleManager.release();

      // Assert
      expect(mockChannel.detach).not.toHaveBeenCalled();
      expect(channelManager.release).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Released);
    });

    it<TestContext>('should skip detach if channel is in failed state', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
      channelManager,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });
      vi.spyOn(mockChannel, 'state', 'get').mockReturnValue('failed');

      // Act
      await roomLifeCycleManager.release();

      // Assert
      expect(mockChannel.detach).not.toHaveBeenCalled();
      expect(channelManager.release).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Released);
    });

    it<TestContext>('should successfully release after detaching', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
      channelManager,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });
      mockChannel.detach = vi.fn().mockImplementation(() => Promise.resolve(null));

      // Act
      await roomLifeCycleManager.release();

      // Assert
      expect(mockChannel.detach).toHaveBeenCalledTimes(1);
      expect(channelManager.release).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Released);
    });

    it<TestContext>('should retry detach multiple times before succeeding', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
      channelManager,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });
      const ablyError = new Ably.ErrorInfo('detach failed', 12345, 400);

      // Mock detach to fail twice then succeed
      mockChannel.detach = vi
        .fn()
        .mockRejectedValueOnce(ablyError)
        .mockRejectedValueOnce(ablyError)
        .mockResolvedValueOnce(null);

      // Act
      await roomLifeCycleManager.release();

      // Assert
      expect(mockChannel.detach).toHaveBeenCalledTimes(3);
      expect(channelManager.release).toHaveBeenCalledTimes(1);
      expect(roomStatus.status).toBe(RoomStatus.Released);
    });
  });

  describe('channel state monitoring', () => {
    it<TestContext>('should update room status when channel state changes and no operation is in progress', ({
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });

      // Act - simulate channel state change to suspended
      mockChannel.invokeStateChange({
        current: 'suspended',
        previous: 'attached',
        reason: new Ably.ErrorInfo('Connection lost', 80003, 500),
        resumed: false,
      });

      // Assert
      expect(roomStatus.status).toBe(RoomStatus.Suspended);
      expect(roomStatus.error).toBeDefined();
      expect(roomStatus.error?.code).toBe(80003);
    });

    it<TestContext>('should ignore channel state changes when attach operation is in progress', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      let shouldAttach = false;
      let attachCalled = false;
      mockChannel.attach = vi.fn().mockImplementation(() =>
        vi.waitFor(() => {
          attachCalled = true;
          expect(shouldAttach).toBeTruthy();
        }),
      );
      void roomLifeCycleManager.attach();

      // Wait for attachCalled
      await vi.waitFor(() => {
        expect(attachCalled).toBeTruthy();
      });

      // Act - simulate channel state change to suspended
      mockChannel.invokeStateChange({
        current: 'suspended',
        previous: 'attaching',
        reason: new Ably.ErrorInfo('Connection lost', 80003, 500),
        resumed: false,
      });

      // Assert
      expect(roomStatus.status).toBe(RoomStatus.Attaching);
      expect(roomStatus.error).toBeUndefined();

      // Act - let the attach go through
      shouldAttach = true;

      // Assert, we should be attached
      await vi.waitFor(() => {
        expect(roomStatus.status).toBe(RoomStatus.Attached);
        expect(roomStatus.error).toBeUndefined();
      });
    });

    it<TestContext>('should ignore channel state changes when detach operation is in progress', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      let shouldDetach = false;
      let detachCalled = false;
      mockChannel.detach = vi.fn().mockImplementation(() =>
        vi.waitFor(() => {
          detachCalled = true;
          expect(shouldDetach).toBeTruthy();
        }),
      );
      void roomLifeCycleManager.detach();

      // Wait for detachCalled
      await vi.waitFor(() => {
        expect(detachCalled).toBeTruthy();
      });

      // Act - simulate channel state change to suspended
      mockChannel.invokeStateChange({
        current: 'suspended',
        previous: 'detaching',
        reason: new Ably.ErrorInfo('Connection lost', 80003, 500),
        resumed: false,
      });

      // Assert
      expect(roomStatus.status).toBe(RoomStatus.Detaching);
      expect(roomStatus.error).toBeUndefined();

      // Act - let the detach go through
      shouldDetach = true;

      // Assert, we should be detached
      await vi.waitFor(() => {
        expect(roomStatus.status).toBe(RoomStatus.Detached);
        expect(roomStatus.error).toBeUndefined();
      });
    });

    it<TestContext>('should ignore channel state changes when release operation is in progress', async ({
      roomLifeCycleManager,
      mockChannel,
      roomStatus,
    }) => {
      // Arrange
      roomStatus.setStatus({ status: RoomStatus.Attached });
      let shouldDetach = false;
      let detachCalled = false;
      mockChannel.detach = vi.fn().mockImplementation(() =>
        vi.waitFor(() => {
          detachCalled = true;
          expect(shouldDetach).toBeTruthy();
        }),
      );
      void roomLifeCycleManager.release();

      // Wait for releaseCalled
      await vi.waitFor(() => {
        expect(detachCalled).toBeTruthy();
      });

      // Act - simulate channel state change to suspended
      mockChannel.invokeStateChange({
        current: 'suspended',
        previous: 'attached',
        reason: new Ably.ErrorInfo('Connection lost', 80003, 500),
        resumed: false,
      });

      // Assert
      expect(roomStatus.status).toBe(RoomStatus.Releasing);
      expect(roomStatus.error).toBeUndefined();

      // Act - let the release go through
      shouldDetach = true;

      // Assert, we should be released
      await vi.waitFor(() => {
        expect(roomStatus.status).toBe(RoomStatus.Released);
        expect(roomStatus.error).toBeUndefined();
      });
    });

    describe.each([
      ['initialized', RoomStatus.Initialized],
      ['attaching', RoomStatus.Attaching],
      ['attached', RoomStatus.Attached],
      ['detaching', RoomStatus.Detaching],
      ['detached', RoomStatus.Detached],
      ['suspended', RoomStatus.Suspended],
      ['failed', RoomStatus.Failed],
    ])('should handle channel state %s', (state: string, expectedStatus: RoomStatus) => {
      it<TestContext>('performs channel update', (context) => {
        // Arrange
        context.roomStatus.setStatus({ status: RoomStatus.Attached });

        // Act
        context.mockChannel.invokeStateChange({
          current: state as Ably.ChannelState,
          previous: 'attached',
          reason: undefined,
          resumed: false,
        });

        // Assert
        expect(context.roomStatus.status).toBe(expectedStatus);
      });
    });
  });

  describe('discontinuity monitoring', () => {
    it<TestContext>('should not emit discontinuity on first attach attached', ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should not emit discontinuity when resumed is true attached', ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Second attach with resumed=true
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: true,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should emit discontinuity when not first attach and resumed is false attached', ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      roomLifeCycleManager.testForceHasAttachedOnce(true);

      // Second attach with resumed=false
      const reason = new Ably.ErrorInfo('test error', 12345, 503);
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        reason,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.toBeErrorInfo({
          message: 'discontinuity detected',
          code: ErrorCode.RoomDiscontinuity,
          statusCode: 503,
          cause: reason as ErrorInfoCompareType,
        }),
      );
    });

    it<TestContext>('should not emit discontinuity after explicit detach attached event', async ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Explicit detach
      (mockChannel.detach as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await roomLifeCycleManager.detach();

      // Re-attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should allow handler to be removed', ({ mockChannel, roomLifeCycleManager }) => {
      const handler = vi.fn();
      const subscription = roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Remove handler
      subscription.off();

      // Second attach with resumed=false
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should not emit discontinuity on first attach update', ({ mockChannel, roomLifeCycleManager }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Update event
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attached',
          resumed: false,
        },
        true,
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should not emit discontinuity when resumed is true update', ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Update event with resumed=true
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attached',
          resumed: true,
        },
        true,
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should not emit discontinuity when not double attached', ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Update event with resumed=true
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attaching',
          resumed: false,
        },
        true,
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it<TestContext>('should emit discontinuity when not first attach and resumed is false update', ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      roomLifeCycleManager.testForceHasAttachedOnce(true);

      // Update event with resumed=false
      const reason = new Ably.ErrorInfo('test error', 12345, 503);
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attached',
          resumed: false,
          reason,
        },
        true,
      );

      expect(handler).toHaveBeenCalledWith(
        expect.toBeErrorInfo({
          message: 'discontinuity detected',
          code: ErrorCode.RoomDiscontinuity,
          statusCode: 503,
          cause: reason as ErrorInfoCompareType,
        }),
      );
    });

    it<TestContext>('should not emit discontinuity after explicit detach update event', async ({
      mockChannel,
      roomLifeCycleManager,
    }) => {
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // First attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Explicit detach
      (mockChannel.detach as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await roomLifeCycleManager.detach();

      // Re-attach
      mockChannel.invokeStateChange({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
      });

      // Update event
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attached',
          resumed: false,
        },
        true,
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it<TestContext>('should dispose and clean up all realtime channel subscriptions', (context) => {
      const { roomLifeCycleManager, mockChannel } = context;
      const channel = mockChannel;

      // Act - dispose room lifecycle manager
      roomLifeCycleManager.dispose();

      // Assert - verify channel.off is called to remove listeners
      expect(channel.off).toHaveBeenCalledTimes(3);
      expect(channel.off).toHaveBeenCalledWith(expect.any(Function)); // General state change listener
      expect(channel.off).toHaveBeenCalledWith(expect.any(Function)); // Discontinuity attached listener
      expect(channel.off).toHaveBeenCalledWith(expect.any(Function)); // Discontinuity update listener
    });

    it<TestContext>('should dispose and remove channel listeners', ({ roomLifeCycleManager, mockChannel }) => {
      // Force that we've attached once
      roomLifeCycleManager.testForceHasAttachedOnce(true);

      // Add a discontinuity listener to verify it gets cleaned up
      const handler = vi.fn();
      roomLifeCycleManager.onDiscontinuity(handler);

      // Emulate a discontinuity event
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attached',
          resumed: false,
        },
        true,
      );

      // Verify that the discontinuity listener was called
      expect(handler).toHaveBeenCalledTimes(1);

      // Reset the listener
      handler.mockClear();

      // Arrange - verify listeners are set up
      expect(mockChannel.on).toHaveBeenCalledTimes(3); // One for general state changes, two for discontinuity

      // Act
      roomLifeCycleManager.dispose();

      // Emulate a discontinuity event
      mockChannel.invokeStateChange(
        {
          current: 'attached',
          previous: 'attaching',
          resumed: false,
        },
        true,
      );

      // Verify that the discontinuity listener was not called
      expect(handler).not.toHaveBeenCalled();

      // Assert - verify that user-provided listeners were unsubscribed
      const managerWithHasListeners = roomLifeCycleManager as RoomLifecycleManager & { hasListeners(): boolean };
      expect(managerWithHasListeners.hasListeners()).toBe(false);
    });

    it<TestContext>('should not fail when disposing multiple times', ({ roomLifeCycleManager }) => {
      // Act & Assert - should not throw
      expect(() => {
        roomLifeCycleManager.dispose();
        roomLifeCycleManager.dispose();
        roomLifeCycleManager.dispose();
      }).not.toThrow();
    });
  });
});
