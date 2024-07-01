import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

import { HandlesDiscontinuity } from './discontinuity.js';
import { Logger } from './logger.js';
import { DefaultStatus, RoomStatus, RoomStatusChange } from './RoomStatus.js';

/**
 * An interface for features that contribute to the room status.
 */
export interface ContributesToRoomLifecycle extends HandlesDiscontinuity {
  /**
   * Gets the channel on which the feature operates.
   */
  get channel(): Ably.RealtimeChannel;
}

/**
 * A map of contributors to pending discontinuity events.
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
type DiscontinutyEventMap = Map<ContributesToRoomLifecycle, Ably.ErrorInfo | undefined>;
/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class RoomLifecycleManager {
  /**
   * The status of the room.
   */
  private readonly _status: DefaultStatus;

  /**
   *
   */
  private readonly _contributors: ContributesToRoomLifecycle[];
  private readonly _logger: Logger;
  private readonly _mtx = new Mutex();
  private readonly _transientDetachTimeouts: Map<ContributesToRoomLifecycle, ReturnType<typeof setTimeout>>;
  private _lastAttachErrorContributor?: ContributesToRoomLifecycle;
  private _ignoreContributorDetachments = false;
  private _pendingDiscontinuityEvents: DiscontinutyEventMap = new Map();
  private _firstAttachesCompleted = new Map<ContributesToRoomLifecycle, boolean>();

  /**
   * Constructs a new `RoomLifecycleManager` instance.
   * @param status The status to update.
   * @param contributers The features that contribute to the room status.
   * @param logger The logger to use.
   * @param transientDetachTimeout The number of milliseconds to consider a detach to be "transient"
   */
  constructor(
    status: DefaultStatus,
    contributers: ContributesToRoomLifecycle[],
    logger: Logger,
    transientDetachTimeout: number,
  ) {
    this._logger = logger;
    this._contributors = contributers;
    this._transientDetachTimeouts = new Map();
    this._status = status;

    this.setupContributorListeners(transientDetachTimeout);
  }

  /**
   * Sets up listeners for each contributor to the room status.
   *
   * @param transientDetachTimeout The number of milliseconds to consider a detach to be "transient"
   */
  private setupContributorListeners(transientDetachTimeout: number): void {
    this._contributors.forEach((contributor: ContributesToRoomLifecycle) => {
      // Update events are one way to get a discontinuity
      // The occur when the server sends another attach message to the client
      contributor.channel.on(['update'], (change: Ably.ChannelStateChange) => {
        // If this is our first attach, we should ignore the event
        if (!this._firstAttachesCompleted.has(contributor)) {
          this._logger.debug('RoomStatusMonitor(); ignoring update event for feature as first attach', {
            channel: contributor.channel.name,
            change,
          });
          return;
        }

        // If the resumed flag is set, this is not a discontinuity
        if (change.resumed) {
          this._logger.debug('RoomStatusMonitor(); update event received but was resume');
          return;
        }

        // If we're ignoring contributor detachments, we should queue the event if we don't already have one
        if (this._ignoreContributorDetachments) {
          if (this._pendingDiscontinuityEvents.has(contributor)) {
            this._logger.debug('RoomStatusMonitor(); subsequent update event for feature received, ignoring', {
              channel: contributor.channel.name,
              change,
            });
            return;
          }

          this._logger.debug('RoomStatusMonitor(); queing pending update event for feature as operation in progress', {
            channel: contributor.channel.name,
            change,
          });
          this._pendingDiscontinuityEvents.set(contributor, change.reason);
          return;
        }

        // If we're notignoring contirbutor detachments, we should process the event
        this._logger.debug('RoomStatusMonitor(); update event received', { channel: contributor.channel.name, change });
        contributor.discontinuityDetected(change.reason);
      });

      // We handle all events except update events here
      contributor.channel.on(
        ['initialized', 'attaching', 'attached', 'detaching', 'detached', 'suspended', 'failed'],
        (change: Ably.ChannelStateChange) => {
          // If we're supposed to be ignoring contributor changes, then we should do nothing except check for
          // resume failures
          if (this._ignoreContributorDetachments) {
            this._logger.debug('RoomStatusMonitor(); ignoring contributor state change due to operation in progress', {
              channel: contributor.channel.name,
              current: change.current,
            });

            // If we've had a resume failure, we should process it by adding it to the pending discontinuity events
            // Only do this if we've managed to complete the first attach successfully
            if (
              change.current === RoomStatus.Attached &&
              !change.resumed &&
              this._firstAttachesCompleted.has(contributor)
            ) {
              this._logger.debug('RoomStatusMonitor(); resume failure detected', { channel: contributor.channel.name });
              if (!this._pendingDiscontinuityEvents.has(contributor)) {
                this._pendingDiscontinuityEvents.set(contributor, change.reason);
              }
            }

            return;
          }

          // If any channel goes to failed, then it's game over for the room
          if (change.current === RoomStatus.Failed) {
            this._logger.debug('RoomStatusMonitor(); detected channel failure', { channel: contributor.channel.name });
            this.clearAllTransientDetachTimeouts();
            this._ignoreContributorDetachments = true;
            this._status.setStatus({
              status: RoomStatus.Failed,
              error: change.reason,
            });

            // We'll make a best effort at detaching all the other channels
            this.detachExcept(contributor).catch((error: unknown) => {
              this._logger.error('RoomStatusMonitor(); failed to detach all channels following failure', {
                contributor: contributor.channel.name,
                error,
              });
            });

            return;
          }

          // If we're in attached, we want to clear the transient detach timeout
          if (change.current === RoomStatus.Attached && this._transientDetachTimeouts.has(contributor)) {
            if (this._transientDetachTimeouts.has(contributor)) {
              this._logger.debug('RoomStatusMonitor(); detected transient detach', {
                channel: contributor.channel.name,
              });
              clearTimeout(this._transientDetachTimeouts.get(contributor));
              this._transientDetachTimeouts.delete(contributor);
            }
          }

          // If we enter suspended, we should consider the room to be suspended, detach other channels
          // and wait for the offending channel to reattach.
          if (change.current === RoomStatus.Suspended) {
            this._logger.debug('RoomStatusMonitor(); detected channel suspension', {
              channel: contributor.channel.name,
            });
            this.onNonTransientDetach(contributor, change.reason);
          }

          // If we're in detached, we want to set a timeout to consider it transient
          // If we don't already have one.
          if (change.current === RoomStatus.Detached && !this._transientDetachTimeouts.has(contributor)) {
            this._logger.debug('RoomStatusMonitor(); detected channel detach', { channel: contributor.channel.name });
            const timeout = setTimeout(() => {
              this.onNonTransientDetach(contributor, change.reason);
            }, transientDetachTimeout);

            this._transientDetachTimeouts.set(contributor, timeout);

            return;
          }
        },
      );
    });
  }

  /**
   * onNonTransientDetach is called when a contributors detachment becomes non-transient.
   *
   * We transition the room status to the status of this contributor and provide the original
   * error that caused the detachment.
   *
   * @param contributor The contributor that has detached.
   * @param detachError The error that caused the detachment.
   */
  private onNonTransientDetach(contributor: ContributesToRoomLifecycle, detachError?: Ably.ErrorInfo): void {
    this._logger.debug('RoomStatusMonitor.onNonTransientDetach();', {
      channel: contributor.channel.name,
      error: detachError,
    });

    // We freeze our state, so that individual channel state changes do not affect the room status
    // We also set our room state to the state of the contributor
    // We clear all the transient detach timeouts, because we're closing all the channels
    this._ignoreContributorDetachments = true;
    this.clearAllTransientDetachTimeouts();
    void this._mtx.runExclusive(() => {
      this._logger.error('RoomStatusMonitor.onNonTransientDetach(); setting room status to contributor status', {
        status: contributor.channel.state as RoomStatus,
        error: detachError,
      });
      this._status.setStatus({
        status: contributor.channel.state as RoomStatus,
        error: detachError,
      });

      // Now we enter a detach cycle for all the other contributors, but we do not update the room status
      // unless we now enter a failure state.
      // Once our room status is detached, we then wait for our offending contributor to reattach
      // Then we can re-enter the attach cycle again
      // If an error occurs during the detach cycle, we force the room status to be failed.
      void this.detachOtherContributorsAndRetryUntilTerminal(contributor);
    });
  }

  private clearAllTransientDetachTimeouts(): void {
    this._transientDetachTimeouts.forEach((timeout: ReturnType<typeof setTimeout>) => {
      clearTimeout(timeout);
    });
    this._transientDetachTimeouts.clear();
  }

  /**
   * Given some contributor that has dropped out, detach everything else and then continuously reattach until either
   * we are in a terminal state or we are attached.
   * @param contributor
   * @returns
   */
  private detachOtherContributorsAndRetryUntilTerminal(contributor: ContributesToRoomLifecycle): Promise<void> {
    // TODO: We need to do something whereby promises get cancelled if we are done with the room, to prevent perpetual
    // reattachment cycles.
    this._logger.trace('RoomLifecycleManager.detachOtherContributorsAndRetryUntilTerminal();', {
      channel: contributor.channel.name,
    });
    return this.detachExcept(contributor)
      .then(() => {
        return new Promise<void>((resolve, reject) => {
          // Watch the problematic contributor and wait for it to reattach
          if (contributor.channel.state === RoomStatus.Attached) {
            resolve();
            return;
          }

          // Wait for a state change
          const listener = (change: Ably.ChannelStateChange) => {
            if (change.current === RoomStatus.Attached) {
              contributor.channel.off(listener);
              resolve();
            }

            if (change.current === RoomStatus.Failed) {
              contributor.channel.off(listener);
              reject(change.reason as unknown as Error);
            }
          };
          contributor.channel.on(listener);
        });
      })
      .then(() => {
        return this.attach();
      })
      .catch((error: unknown) => {
        // If we get an error, look at the current state, if it's failed, we give up.
        if (this._status.currentStatus === RoomStatus.Failed) {
          throw error;
        }

        // Otherwise, we find which contributor caused the problem and wait for it to recover
        if (!this._lastAttachErrorContributor) {
          throw new Error('No last attach error contributor');
        }

        return this.detachOtherContributorsAndRetryUntilTerminal(this._lastAttachErrorContributor);
      });
  }

  /**
   * Try to attach all the channels in a room.
   *
   * If one of the channels fails to attach, the rest of the channels will be detached.
   *
   * We attach by adding subscriptions, to ensure that no messages are missed.
   */
  // TODO: We need to give each feature an error code specific to them, during failure.
  attach(): Promise<void> {
    this._logger.trace('RoomLifecycleManager.attach();');
    // If the room status is attached, this is a no-op
    if (this._status.currentStatus === RoomStatus.Attached) {
      return Promise.resolve();
    }

    // If we're in the process of attaching, we should wait for the attachment to complete
    if (this._status.currentStatus === RoomStatus.Attaching) {
      return new Promise<void>((resolve, reject) => {
        if (this._status.currentStatus === RoomStatus.Attached) {
          resolve();
          return;
        }

        this._status.onStatusChangeOnce((change: RoomStatusChange) => {
          if (change.status === RoomStatus.Attached) {
            resolve();
          }

          reject(change.error as unknown as Error);
        });
      });
    }

    // At this point, we force the room status to be attaching
    this._ignoreContributorDetachments = true;

    return this._mtx.runExclusive(async () => {
      this._status.setStatus({ status: RoomStatus.Attaching });
      const attachResult: RoomStatusChange = { status: RoomStatus.Attached };

      for (const feature of this._contributors) {
        try {
          await feature.channel.attach();

          // Set ourselves into the first attach list - so we can track discontinuity from now on
          this._firstAttachesCompleted.set(feature, true);
        } catch (error: unknown) {
          this._lastAttachErrorContributor = feature;

          // We take the status to be whatever caused the error
          attachResult.status = RoomStatus.Detached;
          attachResult.error = error as Ably.ErrorInfo;

          // The current feature should be in one of three states, it will be either suspended, detached, or failed
          // If it's suspended, we should force it into detached
          // If it's failed, we do nothing
          // If it's detached, we do nothing
          switch (feature.channel.state) {
            case 'suspended':
              // We force the channel to be detached - this always happens when a channel is suspended
              await feature.channel.detach();
              break;
            case 'detached':
              break;
            case 'failed':
              // If we failed, the room status should be failed
              attachResult.status = RoomStatus.Failed;
              break;
            default:
              this._logger.error(`Unexpected channel state ${feature.channel.state}`);
              // TODO: ErrorInfo
              throw new Error(`Unexpected channel state ${feature.channel.state}`);
          }

          // Cycle the features and detach any that are in any state that isn't detached, failed, suspended, or initialized
          for (const featureToDetach of this._contributors) {
            // If the feature is the one that failed, we should not detach it
            if (featureToDetach === feature) {
              continue;
            }

            if (!['detached', 'initialized', 'suspended', 'failed'].includes(featureToDetach.channel.state)) {
              try {
                await featureToDetach.channel.detach();
              } catch (error: unknown) {
                // If, somehow, the detach fails, we should take the room status to be failed
                // But keep the original error
                attachResult.status = RoomStatus.Failed;
              }
            }
          }

          break;
        }
      }

      // We force the room into the status of whatever is the result of the attach
      this._status.setStatus(attachResult);
      this._ignoreContributorDetachments = false;

      // If we're going into attached, trigger discontinuity events
      if (attachResult.status === RoomStatus.Attached) {
        this._pendingDiscontinuityEvents.forEach(
          (error: Ably.ErrorInfo | undefined, contributor: ContributesToRoomLifecycle) => {
            contributor.discontinuityDetected(error);
          },
        );
        this._pendingDiscontinuityEvents.clear();
      }

      // If its an error, we should throw it so the promise rejects
      if (attachResult.error) {
        throw attachResult.error as unknown as Error;
      }
    });
  }

  /**
   * Detaches the room. If the room is already detached, this is a no-op.
   * If one of the channels fails to detach, the room status will be set to failed.
   * If the room is in the process of detaching, this will wait for the detachment to complete.
   *
   * @returns A promise that resolves when the room is detached.
   */
  detach(): Promise<void> {
    // If we're already detached, this is a no-op
    if (this._status.currentStatus === RoomStatus.Detached) {
      return Promise.resolve();
    }

    // If we're in failed, we should not attempt to detach
    if (this._status.currentStatus === RoomStatus.Failed) {
      // TODO: Give it a specific error code
      return Promise.reject(new Ably.ErrorInfo('Room is in a failed state', 50000, 500) as unknown as Error);
    }

    // If we're in the process of detaching, we should wait for the detachment to complete
    if (this._status.currentStatus === RoomStatus.Detaching) {
      return new Promise<void>((resolve, reject) => {
        this._status.onStatusChangeOnce((change: RoomStatusChange) => {
          if (change.status === RoomStatus.Detached) {
            resolve();
            return;
          }

          this._logger.error(`RoomLifecycleManager.detach(); expected detached but got ${change.status}`, {
            error: change.error,
          });
          reject(change.error as unknown as Error);
        });
      });
    }

    // We force the room status to be detaching
    this._ignoreContributorDetachments = true;
    this._status.setStatus({ status: RoomStatus.Detaching });

    // Cycle each channel in series and detach it. If all channels are detached, we set the room status to detached
    // If one of the channels fails to detach, we force the room status to be failed.
    return this._mtx.runExclusive(() => {
      return this.detachExcept()
        .then(() => {
          this._status.setStatus({ status: RoomStatus.Detached });
        })
        .catch((error: unknown) => {
          this._status.setStatus({ status: RoomStatus.Failed, error: error as Ably.ErrorInfo });
          throw error;
        });
    });
  }

  /**
   * Detaches every contributor except for the one provided.
   * If a detach fails, throw an error that explains why the detach failed.
   *
   * @param exceptContributor A contributor to exclude from the detach operation.
   */
  private async detachExcept(exceptContributor?: ContributesToRoomLifecycle): Promise<void> {
    this._logger.trace('RoomLifecycleManager.detachExcept();', { exceptContributor });
    let detachError: Ably.ErrorInfo | undefined;

    for (const contributor of this._contributors) {
      try {
        if (contributor === exceptContributor) {
          continue;
        }

        this._logger.debug('RoomLifecycleManager.detachExcept(); detaching', { channel: contributor.channel.name });
        await contributor.channel.detach();
      } catch (error: unknown) {
        this._logger.error('RoomLifecycleManager.detachExcept(); failed to detach', { error: error as Error });
        // If something goes horribly wrong during the detach, we should force the room to be in a failed state
        // But we should still try to detach the rest of the features
        detachError = error as Ably.ErrorInfo;
      }
    }

    if (detachError) {
      throw detachError as unknown as Error;
    }
  }
}
