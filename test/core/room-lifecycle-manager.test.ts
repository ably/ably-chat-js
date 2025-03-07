import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../../src/core/channel-manager.js';
import { ErrorCodes } from '../../src/core/errors.js';
import { Logger } from '../../src/core/logger.js';
import { RoomLifeCycleManager } from '../../src/core/room-lifecycle-manager.js';
import { DefaultRoomLifecycle, InternalRoomLifecycle, RoomStatus } from '../../src/core/room-status.js';
import { ErrorInfoCompareType } from '../helper/expectations.js';
import { makeTestLogger } from '../helper/logger.js';

interface TestContext {
  roomLifeCycleManager: RoomLifeCycleManager;
  channelManager: ChannelManager;
  roomStatus: InternalRoomLifecycle;
  logger: Logger;
  mockChannel: Partial<Ably.RealtimeChannel> & {
    attach: () => Promise<Ably.ChannelStateChange | null>;
    detach?: () => Promise<Ably.ChannelStateChange | null>;
  };
}

vi.mock('ably');

describe('RoomLifeCycleManager', () => {
  beforeEach<TestContext>((context) => {
    const logger = makeTestLogger();

    context.mockChannel = {
      attach: vi.fn().mockImplementation(() => Promise.resolve(null)),
      detach: vi.fn().mockImplementation(() => Promise.resolve(null)),
      state: 'initialized',
    };

    context.channelManager = {
      get: vi.fn().mockReturnValue(context.mockChannel as Ably.RealtimeChannel),
      release: vi.fn(),
    } as unknown as ChannelManager;

    context.roomStatus = new DefaultRoomLifecycle('test-room', logger);
    context.logger = logger;
    context.roomLifeCycleManager = new RoomLifeCycleManager(
      'test-room',
      context.channelManager,
      context.roomStatus,
      context.logger,
    );
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
        code: ErrorCodes.RoomIsReleased,
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
        code: ErrorCodes.RoomIsReleasing,
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
        code: ErrorCodes.RoomIsReleased,
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
        code: ErrorCodes.RoomIsReleasing,
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
      mockChannel.detach = vi.fn()
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
});
