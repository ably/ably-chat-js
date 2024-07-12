import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

import { HandlesDiscontinuity } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { Logger } from './logger.js';
import { DefaultStatus, NewRoomStatus, RoomLifecycle, RoomStatusChange } from './RoomStatus.js';

/**
 * An interface for features that contribute to the room status.
 */
export interface ContributesToRoomLifecycle extends HandlesDiscontinuity {
  /**
   * Gets the channel on which the feature operates.
   */
  get channel(): Ably.RealtimeChannel;

  /**
   * Gets the ErrorInfo code that should be used when the feature fails to attach.
   * @returns The error that should be used when the feature fails to attach.
   */
  get attachmentErrorCode(): ErrorCodes;

  /**
   * Gets the ErrorInfo code that should be used when the feature fails to detach.
   * @returns The error that should be used when the feature fails to detach.
   */
  get detachmentErrorCode(): ErrorCodes;
}

/**
 * The order of precedence for lifecycle operations, passed to the mutex which allows
 * us to ensure that internal operations take precedence over user-driven operations.
 */
enum LifecycleOperationPrecedence {
  Internal = 0,
  Release = 1,
  AttachOrDetach = 2,
}

/**
 * A map of contributors to pending discontinuity events.
 */
type DiscontinuityEventMap = Map<ContributesToRoomLifecycle, Ably.ErrorInfo | undefined>;

/**
 * An internal interface that represents the result of a room attachment operation.
 */
type RoomAttachmentResult = NewRoomStatus & {
  failedFeature?: ContributesToRoomLifecycle;
};

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
   * The features that contribute to the room status.
   */
  private readonly _contributors: ContributesToRoomLifecycle[];
  private readonly _logger: Logger;

  /**
   * This mutex allows us to ensure the integrity and atomicity of operations that affect the room status, such as
   * attaching, detaching, and releasing the room. It makes sure that we don't have multiple operations happening
   * at once which could leave us in an inconsistent state.
   */
  private readonly _mtx = new Mutex();

  /**
   * A map of contributors to transient detach timeouts.
   *
   * If a channel enters the attaching state (as a result of a server initiated detach), we should initially
   * consider it to be transient and not bother changing the room status.
   */
  private readonly _transientDetachTimeouts: Map<ContributesToRoomLifecycle, ReturnType<typeof setTimeout>>;

  /**
   * This flag indicates whether some sort of controlled operation is in progress (e.g. attaching, detaching, releasing).
   *
   * It is used to prevent the room status from being changed by individual channel state changes and ignore
   * underlying channel events until we reach a consistent state.
   */
  private _operationInProgress = false;

  /**
   * A map of pending discontinuity events.
   *
   * When a discontinuity happens due to a failed resume, we don't want to surface that until the room is consistently
   * attached again. This map allows us to queue up discontinuity events until we're ready to process them.
   */
  private _pendingDiscontinuityEvents: DiscontinuityEventMap = new Map();

  /**
   * A map of contributors to whether their first attach has completed.
   *
   * Used to control whether we should trigger discontinuity events.
   */
  private _firstAttachesCompleted = new Map<ContributesToRoomLifecycle, boolean>();

  /**
   * Are we in the process of releasing the room?
   */
  private _releaseInProgress = false;

  /**
   * Constructs a new `RoomLifecycleManager` instance.
   * @param status The status to update.
   * @param contributors The features that contribute to the room status.
   * @param logger An instance of the Logger.
   * @param transientDetachTimeout The number of milliseconds to consider a detach to be "transient"
   */
  constructor(
    status: DefaultStatus,
    contributors: ContributesToRoomLifecycle[],
    logger: Logger,
    transientDetachTimeout: number,
  ) {
    this._logger = logger;
    this._contributors = contributors;
    this._transientDetachTimeouts = new Map();
    this._status = status;

    // This shouldn't be the case except in testing, but if we're already attached, then we should consider
    // ourselves not in the middle of an operation and thus consider channel events.
    if (this._status.current !== RoomLifecycle.Attached) {
      this._operationInProgress = true;
    }

    this._setupContributorListeners(transientDetachTimeout);
  }

  /**
   * Sets up listeners for each contributor to the room status.
   *
   * @param transientDetachTimeout The number of milliseconds to consider a detach to be "transient"
   */
  private _setupContributorListeners(transientDetachTimeout: number): void {
    this._contributors.forEach((contributor: ContributesToRoomLifecycle) => {
      // Update events are one way to get a discontinuity
      // The occur when the server sends another attach message to the client
      contributor.channel.on(['update'], (change: Ably.ChannelStateChange) => {
        // If this is our first attach, we should ignore the event
        if (!this._firstAttachesCompleted.has(contributor)) {
          this._logger.debug('RoomLifecycleManager() on update; ignoring update event for feature as first attach', {
            channel: contributor.channel.name,
            change,
          });
          return;
        }

        // If the resumed flag is set, this is not a discontinuity
        if (change.resumed) {
          this._logger.debug('RoomLifecycleManager(); update event received but was resume');
          return;
        }

        // If we're ignoring contributor detachments, we should queue the event if we don't already have one
        if (this._operationInProgress) {
          if (this._pendingDiscontinuityEvents.has(contributor)) {
            this._logger.debug('RoomLifecycleManager(); subsequent update event for feature received, ignoring', {
              channel: contributor.channel.name,
              change,
            });
            return;
          }

          this._logger.debug(
            'RoomLifecycleManager(); queuing pending update event for feature as operation in progress',
            {
              channel: contributor.channel.name,
              change,
            },
          );
          this._pendingDiscontinuityEvents.set(contributor, change.reason);
          return;
        }

        // If we're not ignoring contributor detachments, we should process the event
        this._logger.debug('RoomLifecycleManager(); update event received', {
          channel: contributor.channel.name,
          change,
        });
        contributor.discontinuityDetected(change.reason);
      });

      // We handle all events except update events here
      contributor.channel.on(
        ['initialized', 'attaching', 'attached', 'detaching', 'detached', 'suspended', 'failed'],
        (change: Ably.ChannelStateChange) => {
          // If we're supposed to be ignoring contributor changes, then we should do nothing except check for
          // resume failures
          if (this._operationInProgress) {
            this._logger.debug(
              'RoomLifecycleManager() on all events; ignoring contributor state change due to operation in progress',
              {
                channel: contributor.channel.name,
                current: change.current,
              },
            );

            // If we've had a resume failure, we should process it by adding it to the pending discontinuity events
            // Only do this if we've managed to complete the first attach successfully
            if (
              change.current === RoomLifecycle.Attached &&
              !change.resumed &&
              this._firstAttachesCompleted.has(contributor)
            ) {
              this._logger.debug('RoomLifecycleManager(); resume failure detected', {
                channel: contributor.channel.name,
              });
              if (!this._pendingDiscontinuityEvents.has(contributor)) {
                this._pendingDiscontinuityEvents.set(contributor, change.reason);
              }
            }

            return;
          }

          // If any channel goes to failed, then it's game over for the room
          if (change.current === RoomLifecycle.Failed) {
            this._logger.debug('RoomLifecycleManager(); detected channel failure', {
              channel: contributor.channel.name,
            });
            this._clearAllTransientDetachTimeouts();
            this._operationInProgress = true;
            this._status.setStatus({
              status: RoomLifecycle.Failed,
              error: change.reason,
            });

            // We'll make a best effort at detaching all the other channels
            this._doChannelWindDown(contributor).catch((error: unknown) => {
              this._logger.error('RoomLifecycleManager(); failed to detach all channels following failure', {
                contributor: contributor.channel.name,
                error,
              });
            });

            return;
          }

          // If we're in attached, we want to clear the transient detach timeout
          if (change.current === RoomLifecycle.Attached) {
            if (this._transientDetachTimeouts.has(contributor)) {
              this._logger.debug('RoomLifecycleManager(); detected transient detach', {
                channel: contributor.channel.name,
              });
              clearTimeout(this._transientDetachTimeouts.get(contributor));
              this._transientDetachTimeouts.delete(contributor);
            }

            // If everything is attached, set the room status to attached
            if (
              this._status.current !== RoomLifecycle.Attached &&
              this._contributors.every(
                (contributor: ContributesToRoomLifecycle) => contributor.channel.state === 'attached',
              )
            ) {
              this._logger.debug('RoomLifecycleManager(); all features attached, setting room status to attached');
              this._status.setStatus({ status: RoomLifecycle.Attached });
            }

            return;
          }

          // If we enter suspended, we should consider the room to be suspended, detach other channels
          // and wait for the offending channel to reattach.
          if (change.current === RoomLifecycle.Suspended) {
            this._logger.debug('RoomLifecycleManager(); detected channel suspension', {
              channel: contributor.channel.name,
            });
            this._onChannelSuspension(contributor, change.reason);
            return;
          }

          // If we're in detached, we want to set a timeout to consider it transient
          // If we don't already have one.
          if (change.current === RoomLifecycle.Attaching && !this._transientDetachTimeouts.has(contributor)) {
            this._logger.debug('RoomLifecycleManager(); detected channel detach', {
              channel: contributor.channel.name,
            });
            const timeout = setTimeout(() => {
              // If we get here, then we're still in the attaching state, so set the room status to attaching.
              // We'll have the status as attaching and be optimistic that the channel will reattach, eventually.
              // We'll let ably-js sort out the rest.
              this._status.setStatus({ status: RoomLifecycle.Attaching, error: change.reason });
              this._transientDetachTimeouts.delete(contributor);
              clearTimeout(timeout);
            }, transientDetachTimeout);

            this._transientDetachTimeouts.set(contributor, timeout);

            return;
          }
        },
      );
    });
  }

  /**
   * _onChannelSuspension is called when a contributing channel enters the suspended state, which means
   * that the room is also suspended and we should wind-down channels until things recover.
   *
   * We transition the room status to the status of this contributor and provide the original
   * error that caused the detachment.
   *
   * @param contributor The contributor that has detached.
   * @param detachError The error that caused the detachment.
   */
  private _onChannelSuspension(contributor: ContributesToRoomLifecycle, detachError?: Ably.ErrorInfo): void {
    this._logger.debug('RoomLifecycleManager._onChannelSuspension();', {
      channel: contributor.channel.name,
      error: detachError,
    });

    // We freeze our state, so that individual channel state changes do not affect the room status
    // We also set our room state to the state of the contributor
    // We clear all the transient detach timeouts, because we're closing all the channels
    this._operationInProgress = true;
    this._clearAllTransientDetachTimeouts();

    // We enter the protected block with priority Internal, so take precedence over user-driven actions
    // This process is looping and will continue until a conclusion is reached.
    void this._mtx
      .runExclusive(() => {
        this._logger.error('RoomLifecycleManager._onChannelSuspension(); setting room status to contributor status', {
          status: contributor.channel.state as RoomLifecycle,
          error: detachError,
        });
        this._status.setStatus({
          status: contributor.channel.state as RoomLifecycle,
          error: detachError,
        });

        return this._doRetry(contributor);
      }, LifecycleOperationPrecedence.Internal)
      .catch((error: unknown) => {
        this._logger.error('RoomLifecycleManager._onChannelSuspension(); unexpected error thrown', { error });
      });
  }

  /**
   * Given some contributor that has entered a suspended state:
   *
   * - Wind down any other channels
   * - Wait for our contributor to recover
   * - Attach everything else
   *
   * Repeat until either of the following happens:
   *
   * - Our contributor reattaches and we can attach everything else (repeat with the next contributor to break if necessary)
   * - The room enters a failed state
   *
   * @param contributor The contributor that has entered a suspended state.
   * @returns A promise that resolves when the room is attached, or the room enters a failed state.
   */
  private async _doRetry(contributor: ContributesToRoomLifecycle): Promise<void> {
    // A helper that allows us to retry the attach operation
    const doAttachWithRetry = () => {
      this._logger.debug('RoomLifecycleManager.doAttachWithRetry();');
      this._status.setStatus({ status: RoomLifecycle.Attaching });

      return this._doAttach().then((result: RoomAttachmentResult) => {
        this._logger.debug('RoomLifecycleManager.doAttachWithRetry(); attach result', {
          status: result.status,
          error: result.error,
          failedFeature: result.failedFeature?.channel.name,
        });
        // If we're in failed, then we should wind down all the channels, eventually - but we're done here
        if (result.status === RoomLifecycle.Failed) {
          void this._mtx.runExclusive(
            () => this._runDownChannelsOnFailedAttach(),
            LifecycleOperationPrecedence.Internal,
          );
          return;
        }

        // If we're in suspended, then we should wait for the channel to reattach, but wait for it to do so
        if (result.status === RoomLifecycle.Suspended) {
          const failedFeature = result.failedFeature;
          if (!failedFeature) {
            throw new Ably.ErrorInfo('no failed feature in _doRetry', ErrorCodes.RoomLifecycleError, 500);
          }

          this._logger.debug('RoomLifecycleManager.doAttachWithRetry(); feature suspended, retrying attach', {
            feature: failedFeature.channel.name,
          });
          return this._doRetry(failedFeature).catch();
        }

        // We attached, huzzah!
      });
    };

    // Handle the channel wind-down.
    this._logger.debug('RoomLifecycleManager._doRetry(); winding down channels except problem', {
      channel: contributor.channel.name,
    });
    try {
      await this._doChannelWindDown(contributor).catch(() => {
        // If in doing the wind down, we've entered failed state, then it's game over anyway
        if (this._status.current === RoomLifecycle.Failed) {
          throw new Error('room is in a failed state');
        }

        // If not, we wait a short period and then try again
        return new Promise<unknown>((resolve) => {
          setTimeout(() => {
            resolve(this._doChannelWindDown(contributor));
          }, 250);
        });
      });
    } catch (error: unknown) {
      // If an error gets through here, then the room has entered the failed state, we're done.
      return;
    }

    // If our problem channel has reattached, then we can retry the attach
    if (contributor.channel.state === RoomLifecycle.Attached) {
      this._logger.debug('RoomLifecycleManager._doRetry(); feature reattached, retrying attach');
      return doAttachWithRetry();
    }

    // Otherwise, wait for our problem channel to re-attach and try again
    return new Promise<void>((resolve) => {
      const listener = (change: Ably.ChannelStateChange) => {
        if (change.current === RoomLifecycle.Attached) {
          contributor.channel.off(listener);
          resolve();
          return;
        }

        if (change.current === RoomLifecycle.Failed) {
          contributor.channel.off(listener);
          this._status.setStatus({ status: RoomLifecycle.Failed, error: change.reason });
          throw change.reason ?? new Ably.ErrorInfo('unknown error in _doRetry', ErrorCodes.RoomLifecycleError, 500);
        }
      };
      contributor.channel.on(listener);
    }).then(() => {
      this._logger.debug('RoomLifecycleManager._doRetry(); feature reattached via listener, retrying attach');
      return doAttachWithRetry();
    });
  }

  /**
   * Clears all transient detach timeouts - used when some event supersedes the transient detach such
   * as a failed channel or suspension.
   */
  private _clearAllTransientDetachTimeouts(): void {
    this._transientDetachTimeouts.forEach((timeout: ReturnType<typeof setTimeout>) => {
      clearTimeout(timeout);
    });
    this._transientDetachTimeouts.clear();
  }

  /**
   * Try to attach all the channels in a room.
   *
   * If the operation succeeds, the room enters the attached state and this promise resolves.
   * If a channel enters the suspended state, then we reject, but we will retry after a short delay as is the case
   * in the core SDK.
   * If a channel enters the failed state, we reject and then begin to wind down the other channels.
   */
  attach(): Promise<void> {
    this._logger.trace('RoomLifecycleManager.attach();');
    return this._mtx.runExclusive(async () => {
      // If the room status is attached, this is a no-op
      if (this._status.current === RoomLifecycle.Attached) {
        return Promise.resolve();
      }

      // If the room is released, we can't attach
      if (this._status.current === RoomLifecycle.Released) {
        return Promise.reject(
          new Ably.ErrorInfo('unable to attach room; room is released', ErrorCodes.RoomIsReleased, 500),
        );
      }

      // If the room is releasing, we can't attach
      if (this._status.current === RoomLifecycle.Releasing) {
        return Promise.reject(
          new Ably.ErrorInfo('unable to attach room; room is releasing', ErrorCodes.RoomIsReleasing, 500),
        );
      }

      // At this point, we force the room status to be attaching
      this._clearAllTransientDetachTimeouts();
      this._operationInProgress = true;
      this._status.setStatus({ status: RoomLifecycle.Attaching });

      return this._doAttach().then((result: RoomAttachmentResult) => {
        // If we're in a failed state, then we should wind down all the channels, eventually
        if (result.status === RoomLifecycle.Failed) {
          this._logger.debug('RoomLifecycleManager.attach(); room entered failed, winding down channels', { result });
          void this._mtx.runExclusive(
            () => this._runDownChannelsOnFailedAttach(),
            LifecycleOperationPrecedence.Internal,
          );

          throw result.error ?? new Ably.ErrorInfo('unknown error in attach', ErrorCodes.RoomLifecycleError, 500);
        }

        // If we're in suspended, then this attach should fail, but we'll retry after a short delay async
        if (result.status === RoomLifecycle.Suspended) {
          this._logger.debug('RoomLifecycleManager.attach(); room entered suspended, will retry', {
            error: result.error,
            contributor: result.failedFeature?.channel.name,
          });
          const failedFeature = result.failedFeature;
          if (!failedFeature) {
            throw new Ably.ErrorInfo('no failed feature in attach', ErrorCodes.RoomLifecycleError, 500);
          }

          void this._mtx.runExclusive(
            () => this._doRetry(failedFeature).catch(),
            LifecycleOperationPrecedence.Internal,
          );

          throw (
            result.error ?? new Ably.ErrorInfo('unknown error in attach then block', ErrorCodes.RoomLifecycleError, 500)
          );
        }

        // We attached, huzzah!
      });
    }, LifecycleOperationPrecedence.AttachOrDetach);
  }

  private async _doAttach(): Promise<RoomAttachmentResult> {
    this._logger.trace('RoomLifecycleManager._doAttach();');
    const attachResult: RoomAttachmentResult = {
      status: RoomLifecycle.Attached,
    };

    for (const feature of this._contributors) {
      try {
        this._logger.debug('RoomLifecycleManager._doAttach(); attaching', { channel: feature.channel.name });
        await feature.channel.attach();
        this._logger.debug('RoomLifecycleManager._doAttach(); attached', { channel: feature.channel.name });

        // Set ourselves into the first attach list - so we can track discontinuity from now on
        this._firstAttachesCompleted.set(feature, true);
      } catch (error: unknown) {
        this._logger.error('RoomLifecycleManager._doAttach(); failed to attach', { error: attachResult.error });
        attachResult.failedFeature = feature;

        // We take the status to be whatever caused the error
        attachResult.error = new Ably.ErrorInfo(
          'failed to attach feature',
          feature.attachmentErrorCode,
          500,
          error as Ably.ErrorInfo,
        );

        // The current feature should be in one of two states, it will be either suspended or failed
        // If it's in suspended, we wind down the other channels and wait for the reattach
        // If it's failed, we can fail the entire room
        switch (feature.channel.state) {
          case 'suspended':
            attachResult.status = RoomLifecycle.Suspended;
            break;
          case 'failed':
            // If we failed, the room status should be failed
            attachResult.status = RoomLifecycle.Failed;
            break;
          default:
            this._logger.error(`Unexpected channel state ${feature.channel.state}`);
            throw new Ably.ErrorInfo(
              `unexpected channel state in doAttach ${feature.channel.state}`,
              ErrorCodes.RoomLifecycleError,
              500,
            );
        }

        // Regardless of whether we're suspended or failed, run-down the other channels
        // The wind-down procedure will take mutex precedence over any user-driven actions
        this._status.setStatus(attachResult);

        return attachResult;
      }
    }

    // We successfully attached all the channels - set our status to attached, start listening changes in channel status
    this._status.setStatus(attachResult);
    this._operationInProgress = false;
    this._pendingDiscontinuityEvents.forEach(
      (error: Ably.ErrorInfo | undefined, contributor: ContributesToRoomLifecycle) => {
        contributor.discontinuityDetected(error);
      },
    );
    this._pendingDiscontinuityEvents.clear();

    return attachResult;
  }

  /**
   * If we've failed to attach, then we're in the failed state and all that is left to do is to detach all the channels.
   *
   * @returns A promise that resolves when all channels are detached. We do not throw.
   */
  private _runDownChannelsOnFailedAttach(): Promise<unknown> {
    // At this point, we have control over the channel lifecycle, so we can hold onto it until things are resolved
    // Keep trying to detach the channels until they're all detached.
    return this._doChannelWindDown().catch(() => {
      // Something went wrong during the wind down. After a short delay, to give others a turn, we should run down
      // again until we reach a suitable conclusion.
      this._logger.debug('RoomLifecycleManager._runDownChannelsOnFailedAttach(); wind down failed, retrying');
      return new Promise<unknown>((resolve) => {
        setTimeout(() => {
          resolve(this._runDownChannelsOnFailedAttach());
        }, 250);
      });
    });
  }

  /**
   * Detach all features except the one exception provided.
   * If the room is in a failed state, then all channels should either reach the failed state or be detached.
   *
   * @param except The contributor to exclude from the detachment.
   * @returns A promise that resolves when all channels are detached.
   */
  private _doChannelWindDown(except?: ContributesToRoomLifecycle): Promise<unknown> {
    return Promise.all(
      this._contributors.map(async (contributor: ContributesToRoomLifecycle) => {
        // If its the contributor we want to wait for a conclusion on, then we should not detach it
        // Unless we're in a failed state, in which case we should detach it
        if (contributor === except && this._status.current !== RoomLifecycle.Failed) {
          return;
        }

        // If the room's already in the failed state, or it's releasing, we should not detach a failed channel
        if (
          (this._status.current === RoomLifecycle.Failed ||
            this._status.current === RoomLifecycle.Releasing ||
            this._status.current === RoomLifecycle.Released) &&
          contributor.channel.state === 'failed'
        ) {
          this._logger.debug('RoomLifecycleManager._doChannelWindDown(); ignoring failed channel', {
            channel: contributor.channel.name,
          });
          return;
        }

        try {
          this._logger.debug('RoomLifecycleManager._doChannelWindDown(); detaching', {
            channel: contributor.channel.name,
          });
          await contributor.channel.detach();
          this._logger.debug('RoomLifecycleManager._doChannelWindDown(); detached', {
            channel: contributor.channel.name,
          });
        } catch (error: unknown) {
          // If the contributor is in a failed state and we're not ignoring failed states, we should fail the room
          if (
            contributor.channel.state === 'failed' &&
            this._status.current !== RoomLifecycle.Failed &&
            this._status.current !== RoomLifecycle.Releasing &&
            this._status.current !== RoomLifecycle.Released
          ) {
            const contributorError = new Ably.ErrorInfo(
              'failed to detach feature',
              contributor.detachmentErrorCode,
              500,
              error as Ably.ErrorInfo,
            );
            this._status.setStatus({ status: RoomLifecycle.Failed, error: contributorError });
            throw contributorError;
          }

          // We throw an error so that the promise rejects
          throw new Ably.ErrorInfo('detach failure, retry', -1, -1, error as Ably.ErrorInfo);
        }
      }),
    );
  }

  /**
   * Detaches the room. If the room is already detached, this is a no-op.
   * If one of the channels fails to detach, the room status will be set to failed.
   * If the room is in the process of detaching, this will wait for the detachment to complete.
   *
   * @returns A promise that resolves when the room is detached.
   */
  detach(): Promise<void> {
    this._logger.trace('RoomLifecycleManager.detach();');
    return this._mtx.runExclusive(async () => {
      // If we're already detached, this is a no-op
      if (this._status.current === RoomLifecycle.Detached) {
        return Promise.resolve();
      }

      // If the room is released, we can't detach
      if (this._status.current === RoomLifecycle.Released) {
        return Promise.reject(
          new Ably.ErrorInfo('unable to detach room; room is released', ErrorCodes.RoomIsReleased, 500),
        );
      }

      // If the room is releasing, we can't detach
      if (this._status.current === RoomLifecycle.Releasing) {
        return Promise.reject(
          new Ably.ErrorInfo('unable to detach room; room is releasing', ErrorCodes.RoomIsReleasing, 500),
        );
      }

      // If we're in failed, we should not attempt to detach
      if (this._status.current === RoomLifecycle.Failed) {
        return Promise.reject(
          new Ably.ErrorInfo('unable to detach room; room has failed', ErrorCodes.RoomInFailedState, 500),
        );
      }

      // We force the room status to be detaching
      this._operationInProgress = true;
      this._clearAllTransientDetachTimeouts();
      this._status.setStatus({ status: RoomLifecycle.Detaching });

      // We now perform an all-channel wind down.
      // We keep trying until we reach a suitable conclusion.
      return this._doDetach();
    }, LifecycleOperationPrecedence.AttachOrDetach);
  }

  /**
   * Perform a detach.
   *
   * If detaching a channel fails, we should retry until every channel is either in the detached state, or in the failed state.
   */
  private async _doDetach(): Promise<void> {
    this._logger.trace('RoomLifecycleManager._doDetach();');
    let detachError: Ably.ErrorInfo | undefined;
    let done = false;
    while (!done) {
      // First we try to detach all channels, if it fails, then we see if it's an Ably.ErrorInfo with code -1,
      // If it's -1, it means that we need to retry the detach operation
      // If it isn't -1, then we have a failure condition
      try {
        this._logger.debug('RoomLifecycleManager._doDetach(); detaching all channels');
        await this._doChannelWindDown();
      } catch (error: unknown) {
        this._logger.error('RoomLifecycleManager._doDetach(); failed to detach all channels', { error });
        if (error instanceof Ably.ErrorInfo && error.code === -1) {
          this._logger.debug('RoomLifecycleManager._doDetach(); retrying detach', { error });
          await new Promise<void>((resolve) => setTimeout(resolve, 250));
          continue;
        }

        // If we have an error, then this is a failed state error, save it for later
        if (!detachError) {
          this._logger.debug('RoomLifecycleManager._doDetach(); channel failed on detach', { error });
          detachError = error as Ably.ErrorInfo;
        }

        // Wait for a short period and then try again to complete the detach
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        this._logger.debug('RoomLifecycleManager._doDetach(); retrying detach after failed channel');
        continue;
      }

      // If we've made it this far, then we're done
      done = true;
    }

    // If we aren't in the failed state, then we're detached
    if (this._status.current !== RoomLifecycle.Failed) {
      this._status.setStatus({ status: RoomLifecycle.Detached });
      return;
    }

    // If we're in the failed state, then we need to throw the error
    throw detachError ?? new Ably.ErrorInfo('unknown error in _doDetach', ErrorCodes.RoomLifecycleError, 500);
  }

  /**
   * Releases the room. If the room is already released, this is a no-op.
   * Any channel that detaches into the failed state is ok. But any channel that fails to detach
   * will cause the room status to be set to failed.
   *
   * @returns Returns a promise that resolves when the room is released. If a channel detaches into a non-terminated
   * state (e.g. attached), the promise will reject.
   */
  release(): Promise<void> {
    this._logger.trace('RoomLifecycleManager.release();');
    return this._mtx.runExclusive(async () => {
      // If we're already released, this is a no-op
      if (this._status.current === RoomLifecycle.Released) {
        return Promise.resolve();
      }

      // If we're already detached, then we can transition to released immediately
      if (this._status.current === RoomLifecycle.Detached) {
        this._status.setStatus({ status: RoomLifecycle.Released });
        return Promise.resolve();
      }

      // If we're in the process of releasing, we should wait for it to complete
      if (this._releaseInProgress) {
        return new Promise<void>((resolve, reject) => {
          this._status.onChangeOnce((change: RoomStatusChange) => {
            if (change.current === RoomLifecycle.Released) {
              resolve();
              return;
            }

            this._logger.error('RoomLifecycleManager.release(); expected a non-attached state', change);
            reject(
              new Ably.ErrorInfo(
                'failed to release room; existing attempt failed',
                ErrorCodes.PreviousOperationFailed,
                500,
                change.error,
              ),
            );
          });
        });
      }

      // We force the room status to be releasing
      this._clearAllTransientDetachTimeouts();
      this._operationInProgress = true;
      this._releaseInProgress = true;
      this._status.setStatus({ status: RoomLifecycle.Releasing });

      // Do the release until it completes
      this._logger.debug('RoomLifecycleManager.release(); releasing room');
      return this._releaseChannels();
    }, LifecycleOperationPrecedence.Release);
  }

  /**
   *  Releases the room by detaching all channels. If the release operation fails, we wait
   *  a short period and then try again.
   */
  private _releaseChannels(): Promise<void> {
    return this._doRelease().catch((error: unknown) => {
      this._logger.error('RoomLifecycleManager._releaseChannels(); failed to release room, retrying', { error });

      // Wait a short period and then try again
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve(this._releaseChannels());
        }, 250);
      });
    });
  }

  /**
   * Performs the release operation. This will detach all channels in the room that aren't
   * already detached or in the failed state.
   */
  private _doRelease(): Promise<void> {
    return Promise.all(
      this._contributors.map(async (contributor: ContributesToRoomLifecycle) => {
        // Failed channels, we can ignore
        if (contributor.channel.state === 'failed') {
          this._logger.debug('RoomLifecycleManager.release(); ignoring failed channel', {
            channel: contributor.channel.name,
          });
          return;
        }

        // Detached channels, we can ignore
        if (contributor.channel.state === 'detached') {
          this._logger.debug('RoomLifecycleManager.release(); ignoring detached channel', {
            channel: contributor.channel.name,
          });
          return;
        }

        try {
          this._logger.debug('RoomLifecycleManager.release(); detaching', {
            channel: contributor.channel.name,
          });
          await contributor.channel.detach();
          this._logger.debug('RoomLifecycleManager.release(); detached', {
            channel: contributor.channel.name,
          });
        } catch (error: unknown) {
          this._logger.error('RoomLifecycleManager.release(); failed to detach', {
            error,
            channel: contributor.channel.name,
            state: contributor.channel.state,
          });
          throw error as Ably.ErrorInfo;
        }
      }),
    ).then(() => {
      this._releaseInProgress = false;
      this._status.setStatus({ status: RoomLifecycle.Released });
    });
  }
}
