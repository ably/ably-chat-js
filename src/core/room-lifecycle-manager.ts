import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

import { ChannelManager } from './channel-manager.js';
import { DiscontinuityListener } from './discontinuity.js';
import { ErrorCode } from './errors.js';
import { RoomEventType } from './events.js';
import { Logger } from './logger.js';
import { on } from './realtime-subscriptions.js';
import { InternalRoomLifecycle, RoomStatus } from './room-status.js';
import { StatusSubscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * Events that can be emitted by the RoomLifecycleManager
 */
export interface RoomLifeCycleEvents {
  [RoomEventType.Discontinuity]: Ably.ErrorInfo;
}

/**
 * Priority levels for operations, lower numbers are higher priority
 */
enum OperationPriority {
  Release = 0,
  AttachDetach = 1,
}

/**
 * Manages the lifecycle of a room's underlying channel, handling attach, detach and release operations
 * while maintaining the room's status.
 */
export class RoomLifecycleManager {
  private readonly _channelManager: ChannelManager;
  private readonly _roomLifecycle: InternalRoomLifecycle;
  private readonly _logger: Logger;
  private readonly _eventEmitter: EventEmitter<RoomLifeCycleEvents>;
  private _hasAttachedOnce: boolean; // CHA-RL13
  private _isExplicitlyDetached: boolean; // CHA-RL14
  private readonly _mutex: Mutex; // CHA-RL7
  private readonly _unsubscribeChannelStateListener: () => void;
  private readonly _offDiscontinuityAttached: () => void;
  private readonly _offDiscontinuityUpdate: () => void;

  constructor(channelManager: ChannelManager, roomLifecycle: InternalRoomLifecycle, logger: Logger) {
    this._channelManager = channelManager;
    this._roomLifecycle = roomLifecycle;
    this._logger = logger;
    this._eventEmitter = new EventEmitter();
    this._hasAttachedOnce = false; // CHA-RL13
    this._isExplicitlyDetached = false; // CHA-RL14
    this._mutex = new Mutex(); // CHA-RL7

    // Create bound listeners
    const channelStateListener = this._channelStateListener.bind(this);
    const discontinuityOnAttachedListener = this._discontinuityOnAttachedListener.bind(this);
    const discontinuityOnUpdateListener = this._discontinuityOnUpdateListener.bind(this);

    // Use subscription helpers to create cleanup functions
    const channel = this._channelManager.get();
    this._unsubscribeChannelStateListener = on(channel, channelStateListener);
    this._offDiscontinuityAttached = on(channel, 'attached', discontinuityOnAttachedListener);
    this._offDiscontinuityUpdate = on(channel, 'update', discontinuityOnUpdateListener);
  }

  /**
   * Registers a handler for discontinuity events.
   * @param handler The function to be called when a discontinuity is detected
   * @returns An object with an off() method to deregister the handler
   */
  onDiscontinuity(handler: DiscontinuityListener): StatusSubscription {
    this._logger.trace('RoomLifecycleManager.onDiscontinuity()');
    const wrapped = wrap(handler);
    this._eventEmitter.on(RoomEventType.Discontinuity, wrapped);
    return {
      off: () => {
        this._eventEmitter.off(RoomEventType.Discontinuity, wrapped);
      },
    };
  }

  /**
   * Attaches to the channel and updates room status accordingly.
   * If the room is released/releasing, this operation fails.
   * If already attached, this is a no-op.
   */
  async attach(): Promise<void> {
    // CHA-RL1d, CHA-RL7a
    await this._mutex.runExclusive(async () => {
      this._logger.trace('RoomLifecycleManager.attach();');

      // CHA-RL1b, CHA-RL1c
      this._checkRoomNotReleasing('attach');

      // CHA-RL1a
      if (this._roomStatusIs(RoomStatus.Attached)) {
        this._logger.debug('RoomLifecycleManager.attach(); room already attached, no-op');
        return;
      }

      const channel = this._channelManager.get();
      this._logger.debug('RoomLifecycleManager.attach(); attaching room', {
        channelState: channel.state,
      });

      try {
        // CHA-RL1e
        this._setStatus(RoomStatus.Attaching);
        // CHA-RL1k
        await channel.attach();
        this._setStatus(RoomStatus.Attached);
        this._isExplicitlyDetached = false;
        this._hasAttachedOnce = true;
        this._logger.debug('RoomLifecycleManager.attach(); room attached successfully');
      } catch (error) {
        const errInfo = error as Ably.ErrorInfo;
        const attachError = new Ably.ErrorInfo(
          `failed to attach room: ${errInfo.message}`,
          errInfo.code,
          errInfo.statusCode,
          errInfo,
        );

        const newStatus = this._mapChannelStateToRoomStatus(channel.state);
        this._setStatus(newStatus, attachError);
        throw attachError;
      }
    }, OperationPriority.AttachDetach);
  }

  /**
   * Detaches from the channel and updates room status accordingly.
   * If the room is released/releasing, this operation fails.
   * If already detached, this is a no-op.
   */
  async detach(): Promise<void> {
    // CHA-RL2i, CHA-RL7a
    await this._mutex.runExclusive(async () => {
      this._logger.trace('RoomLifecycleManager.detach();');

      // CHA-RL2d
      if (this._roomStatusIs(RoomStatus.Failed)) {
        throw new Ably.ErrorInfo('unable to detach room; room is in failed state', ErrorCode.RoomInInvalidState, 400);
      }

      // CHA-RL2b, CHA-RL2c
      this._checkRoomNotReleasing('detach');

      // CHA-RL2a
      if (this._roomStatusIs(RoomStatus.Detached)) {
        this._logger.debug('RoomLifecycleManager.detach(); room already detached, no-op');
        return;
      }

      const channel = this._channelManager.get();
      this._logger.debug('RoomLifecycleManager.detach(); detaching room', {
        channelState: channel.state,
      });

      try {
        // CHA-RL2j
        this._setStatus(RoomStatus.Detaching);
        // CHA-RL2k
        await channel.detach();
        this._isExplicitlyDetached = true;
        this._setStatus(RoomStatus.Detached);
        this._logger.debug('RoomLifecycleManager.detach(); room detached successfully');
      } catch (error) {
        const errInfo = error as Ably.ErrorInfo;
        const detachError = new Ably.ErrorInfo(
          `failed to detach room: ${errInfo.message}`,
          errInfo.code,
          errInfo.statusCode,
          errInfo,
        );

        const newStatus = this._mapChannelStateToRoomStatus(channel.state);
        this._setStatus(newStatus, detachError);
        throw detachError;
      }
    }, OperationPriority.AttachDetach);
  }

  /**
   * Releases the room by detaching the channel and releasing it from the channel manager.
   * If the channel is in a failed state, skips the detach operation.
   * Will retry detach until successful unless in failed state.
   */
  async release(): Promise<void> {
    // CHA-RL3k, CHA-RL7a
    await this._mutex.runExclusive(async () => {
      this._logger.trace('RoomLifecycleManager.release();');

      // CHA-RL3a
      if (this._roomStatusIs(RoomStatus.Released)) {
        this._logger.debug('RoomLifecycleManager.release(); room already released, no-op');
        return;
      }

      // CHA-RL3b, CHA-RL3j
      if (this._roomStatusIs(RoomStatus.Initialized) || this._roomStatusIs(RoomStatus.Detached)) {
        this._logger.debug('RoomLifecycleManager.release(); room is initialized or detached, releasing immediately', {
          status: this._roomLifecycle.status,
        });
        this._releaseChannel();
        return;
      }

      // CHA-RL3m
      this._setStatus(RoomStatus.Releasing);
      const channel = this._channelManager.get();

      // CHA-RL3n
      this._logger.debug('RoomLifecycleManager.release(); attempting channel detach before release', {
        channelState: channel.state,
      });
      await this._channelDetachLoop(channel);

      // CHA-RL3o, CHA-RL3h
      this._releaseChannel();
    }, OperationPriority.Release);
  }

  /**
   * Maps an Ably channel state to a room status
   * @param channelState The Ably channel state to map.
   * @returns The corresponding room status.
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
        this._logger.error('RoomLifecycleManager._mapChannelStateToRoomStatus(); unknown channel state', {
          channelState,
        });
        return RoomStatus.Failed;
      }
    }
  }

  private _checkRoomNotReleasing(op: string) {
    switch (this._roomLifecycle.status) {
      case RoomStatus.Released: {
        throw new Ably.ErrorInfo(`unable to ${op} room; room is released`, ErrorCode.RoomInInvalidState, 400);
      }
      case RoomStatus.Releasing: {
        throw new Ably.ErrorInfo(
          `unable to ${op} room; room is currently releasing`,
          ErrorCode.RoomInInvalidState,
          400,
        );
      }
    }
  }

  /**
   * Returns the current room status
   * @param status The room status to check against.
   * @returns true if the room status matches, false otherwise.
   */
  private _roomStatusIs(status: RoomStatus): boolean {
    return this._roomLifecycle.status === status;
  }

  /**
   * Disposes of the room lifecycle manager, removing all listeners and subscriptions.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    // Clean up channel listeners using stored unsubscribe functions
    this._unsubscribeChannelStateListener();
    this._offDiscontinuityAttached();
    this._offDiscontinuityUpdate();

    // Clean up user-level listeners
    this._eventEmitter.off();
  }

  /**
   * Checks if there are any listeners registered by users.
   * @internal
   * @returns true if there are listeners, false otherwise.
   */
  hasListeners(): boolean {
    return emitterHasListeners(this._eventEmitter);
  }

  private _channelStateListener(stateChange: Ably.ChannelStateChange): void {
    this._logger.debug('RoomLifecycleManager.channel state changed', {
      oldState: stateChange.previous,
      newState: stateChange.current,
      reason: stateChange.reason,
      resumed: stateChange.resumed,
    });

    // CHA-RL11b
    if (this._operationInProgress()) {
      this._logger.debug(
        'RoomLifecycleManager._startMonitoringChannelState(); ignoring channel state change - operation in progress',
        {
          status: this._roomLifecycle.status,
        },
      );
      return;
    }

    // CHA-RL11c
    const newStatus = this._mapChannelStateToRoomStatus(stateChange.current);
    this._setStatus(newStatus, stateChange.reason);
  }

  private _discontinuityOnAttachedListener(stateChange: Ably.ChannelStateChange): void {
    if (!stateChange.resumed && this._hasAttachedOnce && !this._isExplicitlyDetached) {
      const error = new Ably.ErrorInfo(
        'discontinuity detected',
        ErrorCode.RoomDiscontinuity,
        stateChange.reason?.statusCode ?? 0,
        stateChange.reason,
      );

      this._logger.warn('RoomLifecycleManager._startMonitoringDiscontinuity(); discontinuity detected', {
        error,
      });
      this._eventEmitter.emit(RoomEventType.Discontinuity, error);
    }
  }

  private _discontinuityOnUpdateListener(stateChange: Ably.ChannelStateChange): void {
    if (
      !stateChange.resumed &&
      this._hasAttachedOnce &&
      !this._isExplicitlyDetached &&
      stateChange.current === 'attached' &&
      stateChange.previous === 'attached'
    ) {
      const error = new Ably.ErrorInfo(
        'discontinuity detected',
        ErrorCode.RoomDiscontinuity,
        stateChange.reason?.statusCode ?? 0,
        stateChange.reason,
      );

      this._logger.warn('RoomLifecycleManager._startMonitoringDiscontinuity(); discontinuity detected', {
        error,
      });
      this._eventEmitter.emit(RoomEventType.Discontinuity, error);
    }
  }

  private async _channelDetachLoop(channel: Ably.RealtimeChannel) {
    for (;;) {
      // If channel is now failed, we can stop trying to detach
      const currentState: Ably.ChannelState = channel.state;
      if (currentState === 'failed') {
        this._logger.debug('RoomLifecycleManager._channelDetachLoop(); channel is failed, skipping detach');
        break;
      }

      try {
        await channel.detach();
        break;
      } catch (error) {
        // keep trying
        this._logger.error('RoomLifecycleManager._channelDetachLoop(); failed to detach channel during release', {
          error,
        });
        await new Promise((resolve) => setTimeout(resolve, 250)); // Wait 250ms before retry
      }
    }
  }

  private _setStatus(status: RoomStatus, error?: Ably.ErrorInfo) {
    this._logger.debug('RoomLifecycleManager._setStatus(); updating room status', {
      oldStatus: this._roomLifecycle.status,
      newStatus: status,
      hasError: !!error,
    });
    this._roomLifecycle.setStatus({ status, error });
  }

  private _releaseChannel() {
    this._channelManager.release();
    this._setStatus(RoomStatus.Released);
    this._logger.debug('RoomLifecycleManager._releaseChannel(); room released successfully');
  }

  /**
   * Returns whether there is currently an operation (attach/detach/release) in progress
   * @returns True if an operation is in progress, false otherwise.
   */
  private _operationInProgress(): boolean {
    return this._mutex.isLocked();
  }

  testForceHasAttachedOnce(firstAttach: boolean) {
    this._logger.trace('RoomLifecycleManager.testForceHasAttachedOnce();', { firstAttach });
    this._hasAttachedOnce = firstAttach;
  }
}
