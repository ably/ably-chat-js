import * as Ably from 'ably';

import { ChannelManager } from './channel-manager.js';
import { ErrorCodes } from './errors.js';
import { Logger } from './logger.js';
import { InternalRoomLifecycle, RoomStatus } from './room-status.js';

/**
 * Manages the lifecycle of a room's underlying channel, handling attach, detach and release operations
 * while maintaining the room's status.
 */
export class RoomLifeCycleManager {
  private readonly _channelManager: ChannelManager;
  private readonly _roomLifecyle: InternalRoomLifecycle;
  private readonly _logger: Logger;
  private readonly _roomId: string;

  constructor(roomId: string, channelManager: ChannelManager, roomLifecyle: InternalRoomLifecycle, logger: Logger) {
    this._roomId = roomId;
    this._channelManager = channelManager;
    this._roomLifecyle = roomLifecyle;
    this._logger = logger;
  }

  /**
   * Attaches to the channel and updates room status accordingly.
   * If the room is released/releasing, this operation fails.
   * If already attached, this is a no-op.
   */
  async attach(): Promise<void> {
    this._logger.trace('RoomLifeCycleManager.attach();', { roomId: this._roomId });

    // Check if we're in a terminal state
    this._checkRoomNotReleasing('attach');

    // No-op if already attached
    if (this._roomStatusIs(RoomStatus.Attached)) {
      this._logger.debug('room already attached, no-op', { roomId: this._roomId });
      return;
    }

    const channel = this._channelManager.get();
    this._logger.debug('attaching room', { roomId: this._roomId, channelState: channel.state });

    try {
      this._setStatus(RoomStatus.Attaching);
      await channel.attach();
      this._setStatus(RoomStatus.Attached);
      this._logger.debug('room attached successfully', { roomId: this._roomId });
    } catch (error) {
      const errInfo = error as Ably.ErrorInfo;
      const attachError = new Ably.ErrorInfo(
        `failed to attach room: ${errInfo.message}`,
        errInfo.code,
        errInfo.statusCode,
        errInfo,
      );

      // Map channel state to room state
      const newStatus = this._mapChannelStateToRoomStatus(channel.state);
      this._setStatus(newStatus, attachError);
      throw attachError;
    }
  }

  /**
   * Detaches from the channel and updates room status accordingly.
   * If the room is released/releasing, this operation fails.
   * If already detached, this is a no-op.
   */
  async detach(): Promise<void> {
    this._logger.trace('RoomLifeCycleManager.detach();', { roomId: this._roomId });

    // Check if we're in a terminal state
    this._checkRoomNotReleasing('detach');

    // No-op if already detached
    if (this._roomStatusIs(RoomStatus.Detached)) {
      this._logger.debug('room already detached, no-op', { roomId: this._roomId });
      return;
    }

    const channel = this._channelManager.get();
    this._logger.debug('detaching room', { roomId: this._roomId, channelState: channel.state });

    try {
      this._setStatus(RoomStatus.Detaching);
      await channel.detach();
      this._setStatus(RoomStatus.Detached);
      this._logger.debug('room detached successfully', { roomId: this._roomId });
    } catch (error) {
      const errInfo = error as Ably.ErrorInfo;
      const detachError = new Ably.ErrorInfo(
        `failed to detach room: ${errInfo.message}`,
        errInfo.code,
        errInfo.statusCode,
        errInfo,
      );

      // Map channel state to room state
      const newStatus = this._mapChannelStateToRoomStatus(channel.state);
      this._setStatus(newStatus, detachError);
      throw detachError;
    }
  }

  /**
   * Releases the room by detaching the channel and releasing it from the channel manager.
   * If the channel is in a failed state, skips the detach operation.
   * Will retry detach until successful unless in failed state.
   */
  async release(): Promise<void> {
    this._logger.trace('RoomLifeCycleManager.release();', { roomId: this._roomId });

    // If released, this is no-op
    if (this._roomStatusIs(RoomStatus.Released)) {
      this._logger.debug('room already released, no-op', { roomId: this._roomId });
      return;
    }

    // If we're already detached or initialized, we go straight to released
    if (this._roomStatusIs(RoomStatus.Initialized) || this._roomStatusIs(RoomStatus.Detached)) {
      this._logger.debug('room is initialized or detached, releasing immediately', {
        roomId: this._roomId,
        status: this._roomLifecyle.status,
      });
      this._releaseChannel();
      return;
    }

    this._setStatus(RoomStatus.Releasing);
    const channel = this._channelManager.get();

    // If channel is not in failed state, try to detach
    if (channel.state === 'failed') {
      this._logger.debug('skipping channel detach, channel is failed', {
        roomId: this._roomId,
      });
    } else {
      this._logger.debug('attempting channel detach before release', {
        roomId: this._roomId,
        channelState: channel.state,
      });
      await this._channelDetachLoop(channel);
    }

    // Release the channel
    this._releaseChannel();
  }

  /**
   * Maps an Ably channel state to a room status
   */
  private _mapChannelStateToRoomStatus(channelState: Ably.ChannelState): RoomStatus {
    switch (channelState) {
      case 'initialized': {
        return RoomStatus.Initialized;
      }
      case 'attaching': {
        return RoomStatus.Attaching;
      }
      case 'attached': {
        return RoomStatus.Attached;
      }
      case 'detaching': {
        return RoomStatus.Detaching;
      }
      case 'detached': {
        return RoomStatus.Detached;
      }
      case 'suspended': {
        return RoomStatus.Suspended;
      }
      case 'failed': {
        return RoomStatus.Failed;
      }
      default: {
        this._logger.error('unknown channel state', { roomId: this._roomId, channelState });
        return RoomStatus.Failed;
      }
    }
  }

  private _checkRoomNotReleasing(op: string) {
    switch (this._roomLifecyle.status) {
      case RoomStatus.Released: {
        throw new Ably.ErrorInfo(`cannot ${op} room, room is released`, ErrorCodes.RoomIsReleased, 400);
      }
      case RoomStatus.Releasing: {
        throw new Ably.ErrorInfo(`cannot ${op} room, room is currently releasing`, ErrorCodes.RoomIsReleasing, 400);
      }
    }
  }

  private _roomStatusIs(status: RoomStatus) {
    return this._roomLifecyle.status === status;
  }

  private async _channelDetachLoop(channel: Ably.RealtimeChannel) {
    for (;;) {
      try {
        await channel.detach();
        break;
      } catch (error) {
        // If channel is now failed, we can stop trying to detach
        const currentState: Ably.ChannelState = channel.state;
        if (currentState === 'failed') {
          break;
        }

        // Otherwise keep trying
        this._logger.error('failed to detach channel during release', { roomId: this._roomId, error });
        await new Promise((resolve) => setTimeout(resolve, 250)); // Wait 250ms before retry
      }
    }
  }

  private _setStatus(status: RoomStatus, error?: Ably.ErrorInfo) {
    this._logger.debug('updating room status', {
      roomId: this._roomId,
      oldStatus: this._roomLifecyle.status,
      newStatus: status,
      hasError: !!error,
    });
    this._roomLifecyle.setStatus({ status, error });
  }

  private _unknownLifecycleError(): Ably.ErrorInfo {
    return new Ably.ErrorInfo('unknown lifecycle error', ErrorCodes.RoomLifecycleError, 500);
  }

  private _releaseChannel() {
    this._channelManager.release();
    this._setStatus(RoomStatus.Released);
    this._logger.debug('room released successfully', { roomId: this._roomId });
  }
}
