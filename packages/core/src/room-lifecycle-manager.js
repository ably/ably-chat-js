var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as Ably from 'ably';
import { Mutex } from 'async-mutex';
import { ErrorCodes } from './errors.js';
import { RoomStatus } from './room-status.js';
/**
 * The order of precedence for lifecycle operations, passed to the mutex which allows
 * us to ensure that internal operations take precedence over user-driven operations.
 *
 * The higher the number, the higher the priority.
 */
var LifecycleOperationPrecedence;
(function (LifecycleOperationPrecedence) {
    LifecycleOperationPrecedence[LifecycleOperationPrecedence["Internal"] = 2] = "Internal";
    LifecycleOperationPrecedence[LifecycleOperationPrecedence["Release"] = 1] = "Release";
    LifecycleOperationPrecedence[LifecycleOperationPrecedence["AttachOrDetach"] = 0] = "AttachOrDetach";
})(LifecycleOperationPrecedence || (LifecycleOperationPrecedence = {}));
/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class RoomLifecycleManager {
    /**
     * Constructs a new `RoomLifecycleManager` instance.
     * @param lifecycle The room lifecycle that manages status.
     * @param contributors The features that contribute to the room status.
     * @param logger An instance of the Logger.
     * @param transientDetachTimeout The number of milliseconds to consider a detach to be "transient"
     */
    constructor(lifecycle, contributors, logger, transientDetachTimeout) {
        /**
         * This mutex allows us to ensure the integrity and atomicity of operations that affect the room status, such as
         * attaching, detaching, and releasing the room. It makes sure that we don't have multiple operations happening
         * at once which could leave us in an inconsistent state.
         */
        this._mtx = new Mutex();
        /**
         * This flag indicates whether some sort of controlled operation is in progress (e.g. attaching, detaching, releasing).
         *
         * It is used to prevent the room status from being changed by individual channel state changes and ignore
         * underlying channel events until we reach a consistent state.
         */
        this._operationInProgress = false;
        /**
         * A map of pending discontinuity events.
         *
         * When a discontinuity happens due to a failed resume, we don't want to surface that until the room is consistently
         * attached again. This map allows us to queue up discontinuity events until we're ready to process them.
         */
        this._pendingDiscontinuityEvents = new Map();
        /**
         * A map of contributors to whether their first attach has completed.
         *
         * Used to control whether we should trigger discontinuity events.
         */
        this._firstAttachesCompleted = new Map();
        /**
         * Are we in the process of releasing the room?
         */
        this._releaseInProgress = false;
        this._logger = logger;
        this._contributors = contributors;
        this._transientDetachTimeouts = new Map();
        this._lifecycle = lifecycle;
        this._setupContributorListeners(transientDetachTimeout);
    }
    /**
     * Sets up listeners for each contributor to the room status.
     *
     * @param transientDetachTimeout The number of milliseconds to consider a detach to be "transient"
     */
    _setupContributorListeners(transientDetachTimeout) {
        for (const contributor of this._contributors) {
            // Update events are one way to get a discontinuity
            // The occur when the server sends another attach message to the client
            contributor.channel.on(['update'], (change) => {
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
                    this._logger.debug('RoomLifecycleManager(); queuing pending update event for feature as operation in progress', {
                        channel: contributor.channel.name,
                        change,
                    });
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
            contributor.channel.on(['initialized', 'attaching', 'attached', 'detaching', 'detached', 'suspended', 'failed'], (change) => {
                // If we're supposed to be ignoring contributor changes, then we should do nothing except check for
                // resume failures
                if (this._operationInProgress) {
                    this._logger.debug('RoomLifecycleManager() on all events; ignoring contributor state change due to operation in progress', {
                        channel: contributor.channel.name,
                        current: change.current,
                    });
                    // If we've had a resume failure, we should process it by adding it to the pending discontinuity events
                    // Only do this if we've managed to complete the first attach successfully
                    if (change.current === RoomStatus.Attached &&
                        !change.resumed &&
                        this._firstAttachesCompleted.has(contributor)) {
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
                if (change.current === RoomStatus.Failed) {
                    this._logger.debug('RoomLifecycleManager(); detected channel failure', {
                        channel: contributor.channel.name,
                    });
                    this._clearAllTransientDetachTimeouts();
                    this._startLifecycleOperation();
                    this._lifecycle.setStatus({
                        status: RoomStatus.Failed,
                        error: change.reason,
                    });
                    // We'll make a best effort at detaching all the other channels
                    this._doChannelWindDown(contributor).catch((error) => {
                        this._logger.error('RoomLifecycleManager(); failed to detach all channels following failure', {
                            contributor: contributor.channel.name,
                            error,
                        });
                    });
                    return;
                }
                // If we're in attached, we want to clear the transient detach timeout
                if (change.current === RoomStatus.Attached) {
                    if (this._transientDetachTimeouts.has(contributor)) {
                        this._logger.debug('RoomLifecycleManager(); detected transient detach', {
                            channel: contributor.channel.name,
                        });
                        clearTimeout(this._transientDetachTimeouts.get(contributor));
                        this._transientDetachTimeouts.delete(contributor);
                    }
                    // If everything is attached, set the room status to attached
                    if (this._lifecycle.status !== RoomStatus.Attached &&
                        this._contributors.every((contributor) => contributor.channel.state === 'attached')) {
                        this._logger.debug('RoomLifecycleManager(); all features attached, setting room status to attached');
                        this._lifecycle.setStatus({ status: RoomStatus.Attached });
                    }
                    return;
                }
                // If we enter suspended, we should consider the room to be suspended, detach other channels
                // and wait for the offending channel to reattach.
                if (change.current === RoomStatus.Suspended) {
                    this._logger.debug('RoomLifecycleManager(); detected channel suspension', {
                        channel: contributor.channel.name,
                    });
                    this._onChannelSuspension(contributor, change.reason);
                    return;
                }
                // If we're in detached, we want to set a timeout to consider it transient
                // If we don't already have one.
                if (change.current === RoomStatus.Attaching && !this._transientDetachTimeouts.has(contributor)) {
                    this._logger.debug('RoomLifecycleManager(); detected channel detach', {
                        channel: contributor.channel.name,
                    });
                    const timeout = setTimeout(() => {
                        // If we get here, then we're still in the attaching state, so set the room status to attaching.
                        // We'll have the status as attaching and be optimistic that the channel will reattach, eventually.
                        // We'll let ably-js sort out the rest.
                        this._lifecycle.setStatus({ status: RoomStatus.Attaching, error: change.reason });
                        this._transientDetachTimeouts.delete(contributor);
                        clearTimeout(timeout);
                    }, transientDetachTimeout);
                    this._transientDetachTimeouts.set(contributor, timeout);
                    return;
                }
            });
        }
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
    _onChannelSuspension(contributor, detachError) {
        this._logger.debug('RoomLifecycleManager._onChannelSuspension();', {
            channel: contributor.channel.name,
            error: detachError,
        });
        // We freeze our state, so that individual channel state changes do not affect the room status
        // We also set our room state to the state of the contributor
        // We clear all the transient detach timeouts, because we're closing all the channels
        this._startLifecycleOperation();
        this._clearAllTransientDetachTimeouts();
        // We enter the protected block with priority Internal, so take precedence over user-driven actions
        // This process is looping and will continue until a conclusion is reached.
        void this._mtx
            .runExclusive(() => {
            this._logger.error('RoomLifecycleManager._onChannelSuspension(); setting room status to contributor status', {
                status: contributor.channel.state,
                error: detachError,
            });
            this._lifecycle.setStatus({
                status: contributor.channel.state,
                error: detachError,
            });
            return this._doRetry(contributor);
        }, LifecycleOperationPrecedence.Internal)
            .catch((error) => {
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
    _doRetry(contributor) {
        return __awaiter(this, void 0, void 0, function* () {
            // A helper that allows us to retry the attach operation
            // eslint-disable-next-line unicorn/consistent-function-scoping
            const doAttachWithRetry = () => {
                this._logger.debug('RoomLifecycleManager.doAttachWithRetry();');
                this._lifecycle.setStatus({ status: RoomStatus.Attaching });
                return this._doAttach().then((result) => {
                    var _a;
                    this._logger.debug('RoomLifecycleManager.doAttachWithRetry(); attach result', {
                        status: result.status,
                        error: result.error,
                        failedFeature: (_a = result.failedFeature) === null || _a === void 0 ? void 0 : _a.channel.name,
                    });
                    // If we're in failed, then we should wind down all the channels, eventually - but we're done here
                    if (result.status === RoomStatus.Failed) {
                        void this._mtx.runExclusive(() => this._runDownChannelsOnFailedAttach().finally(() => {
                            this._endLifecycleOperation();
                        }), LifecycleOperationPrecedence.Internal);
                        return;
                    }
                    // If we're in suspended, then we should wait for the channel to reattach and then try again
                    if (result.status === RoomStatus.Suspended) {
                        const failedFeature = result.failedFeature;
                        if (!failedFeature) {
                            throw new Ably.ErrorInfo('no failed feature in _doRetry', ErrorCodes.RoomLifecycleError, 500);
                        }
                        this._logger.debug('RoomLifecycleManager.doAttachWithRetry(); feature suspended, retrying attach', {
                            feature: failedFeature.channel.name,
                        });
                        return this._doRetry(failedFeature).catch();
                    }
                    // We attached, huzzah! It's the end of the loop
                    this._endLifecycleOperation();
                });
            };
            // Handle the channel wind-down.
            this._logger.debug('RoomLifecycleManager._doRetry(); winding down channels except problem', {
                channel: contributor.channel.name,
            });
            try {
                yield this._doChannelWindDown(contributor).catch(() => {
                    // If in doing the wind down, we've entered failed state, then it's game over anyway
                    // TODO: Another PR, but in the even if we get a failed channel, we still need to do the wind down
                    // of other channels for atomicity.
                    // https://github.com/ably/ably-chat-js/issues/416
                    if (this._lifecycle.status === RoomStatus.Failed) {
                        throw new Error('room is in a failed state');
                    }
                    // If not, we wait a short period and then try again
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(this._doChannelWindDown(contributor));
                        }, 250);
                    });
                });
            }
            catch (_a) {
                // If an error gets through here, then the room has entered the failed state, we're done.
                this._endLifecycleOperation();
                return;
            }
            // If our problem channel has reattached, then we can retry the attach
            if (contributor.channel.state === 'attached') {
                this._logger.debug('RoomLifecycleManager._doRetry(); feature reattached, retrying attach');
                return doAttachWithRetry();
            }
            // Otherwise, wait for our problem channel to re-attach and try again
            return new Promise((resolve) => {
                const listener = (change) => {
                    var _a;
                    if (change.current === 'attached') {
                        contributor.channel.off(listener);
                        resolve();
                        return;
                    }
                    if (change.current === 'failed') {
                        contributor.channel.off(listener);
                        this._lifecycle.setStatus({ status: RoomStatus.Failed, error: change.reason });
                        // Its ok to just set operation in progress = false and return here
                        // As every other channel is wound down.
                        this._endLifecycleOperation();
                        throw (_a = change.reason) !== null && _a !== void 0 ? _a : new Ably.ErrorInfo('unknown error in _doRetry', ErrorCodes.RoomLifecycleError, 500);
                    }
                };
                contributor.channel.on(listener);
            }).then(() => {
                this._logger.debug('RoomLifecycleManager._doRetry(); feature reattached via listener, retrying attach');
                return doAttachWithRetry();
            });
        });
    }
    /**
     * Clears all transient detach timeouts - used when some event supersedes the transient detach such
     * as a failed channel or suspension.
     */
    _clearAllTransientDetachTimeouts() {
        for (const timeout of this._transientDetachTimeouts.values()) {
            clearTimeout(timeout);
        }
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
    attach() {
        this._logger.trace('RoomLifecycleManager.attach();');
        return this._mtx.runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            // If the room status is attached, this is a no-op
            if (this._lifecycle.status === RoomStatus.Attached) {
                return;
            }
            // If the room is released, we can't attach
            if (this._lifecycle.status === RoomStatus.Released) {
                throw new Ably.ErrorInfo('unable to attach room; room is released', ErrorCodes.RoomIsReleased, 500);
            }
            // If the room is releasing, we can't attach
            if (this._lifecycle.status === RoomStatus.Releasing) {
                throw new Ably.ErrorInfo('unable to attach room; room is releasing', ErrorCodes.RoomIsReleasing, 500);
            }
            // At this point, we force the room status to be attaching
            this._clearAllTransientDetachTimeouts();
            this._startLifecycleOperation();
            this._lifecycle.setStatus({ status: RoomStatus.Attaching });
            return this._doAttach().then((result) => {
                var _a, _b, _c;
                // If we're in a failed state, then we should wind down all the channels, eventually
                if (result.status === RoomStatus.Failed) {
                    this._logger.debug('RoomLifecycleManager.attach(); room entered failed, winding down channels', { result });
                    void this._mtx.runExclusive(() => this._runDownChannelsOnFailedAttach().finally(() => (this._operationInProgress = false)), LifecycleOperationPrecedence.Internal);
                    throw (_a = result.error) !== null && _a !== void 0 ? _a : new Ably.ErrorInfo('unknown error in attach', ErrorCodes.RoomLifecycleError, 500);
                }
                // If we're in suspended, then this attach should fail, but we'll retry after a short delay async
                if (result.status === RoomStatus.Suspended) {
                    this._logger.debug('RoomLifecycleManager.attach(); room entered suspended, will retry', {
                        error: result.error,
                        contributor: (_b = result.failedFeature) === null || _b === void 0 ? void 0 : _b.channel.name,
                    });
                    const failedFeature = result.failedFeature;
                    if (!failedFeature) {
                        throw new Ably.ErrorInfo('no failed feature in attach', ErrorCodes.RoomLifecycleError, 500);
                    }
                    void this._mtx.runExclusive(() => this._doRetry(failedFeature).catch(), LifecycleOperationPrecedence.Internal);
                    throw ((_c = result.error) !== null && _c !== void 0 ? _c : new Ably.ErrorInfo('unknown error in attach then block', ErrorCodes.RoomLifecycleError, 500));
                }
                // We attached, huzzah!
            });
        }), LifecycleOperationPrecedence.AttachOrDetach);
    }
    _doAttach() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('RoomLifecycleManager._doAttach();');
            const attachResult = {
                status: RoomStatus.Attached,
            };
            for (const feature of this._contributors) {
                try {
                    this._logger.debug('RoomLifecycleManager._doAttach(); attaching', { channel: feature.channel.name });
                    yield feature.channel.attach();
                    this._logger.debug('RoomLifecycleManager._doAttach(); attached', { channel: feature.channel.name });
                    // Set ourselves into the first attach list - so we can track discontinuity from now on
                    this._firstAttachesCompleted.set(feature, true);
                }
                catch (error) {
                    this._logger.error('RoomLifecycleManager._doAttach(); failed to attach', { error: attachResult.error });
                    attachResult.failedFeature = feature;
                    // We take the status to be whatever caused the error
                    attachResult.error = new Ably.ErrorInfo('failed to attach feature', feature.attachmentErrorCode, 500, error);
                    // The current feature should be in one of two states, it will be either suspended or failed
                    // If it's in suspended, we wind down the other channels and wait for the reattach
                    // If it's failed, we can fail the entire room
                    switch (feature.channel.state) {
                        case 'suspended': {
                            attachResult.status = RoomStatus.Suspended;
                            break;
                        }
                        case 'failed': {
                            // If we failed, the room status should be failed
                            attachResult.status = RoomStatus.Failed;
                            break;
                        }
                        default: {
                            this._logger.error(`Unexpected channel state`, { state: feature.channel.state });
                            attachResult.status = RoomStatus.Failed;
                            attachResult.error = new Ably.ErrorInfo(`unexpected channel state in doAttach ${feature.channel.state}`, ErrorCodes.RoomLifecycleError, 500, attachResult.error);
                        }
                    }
                    // Regardless of whether we're suspended or failed, run-down the other channels
                    // The wind-down procedure will take mutex precedence over any user-driven actions
                    this._lifecycle.setStatus(attachResult);
                    return attachResult;
                }
            }
            // We successfully attached all the channels - set our status to attached, start listening changes in channel status
            this._lifecycle.setStatus(attachResult);
            this._endLifecycleOperation();
            // Iterate the pending discontinuity events and trigger them
            for (const [contributor, error] of this._pendingDiscontinuityEvents) {
                contributor.discontinuityDetected(error);
            }
            this._pendingDiscontinuityEvents.clear();
            return attachResult;
        });
    }
    /**
     * If we've failed to attach, then we're in the failed state and all that is left to do is to detach all the channels.
     *
     * @returns A promise that resolves when all channels are detached. We do not throw.
     */
    _runDownChannelsOnFailedAttach() {
        // At this point, we have control over the channel lifecycle, so we can hold onto it until things are resolved
        // Keep trying to detach the channels until they're all detached.
        return this._doChannelWindDown().catch(() => {
            // Something went wrong during the wind down. After a short delay, to give others a turn, we should run down
            // again until we reach a suitable conclusion.
            this._logger.debug('RoomLifecycleManager._runDownChannelsOnFailedAttach(); wind down failed, retrying');
            return new Promise((resolve) => {
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
    _doChannelWindDown(except) {
        return Promise.all(this._contributors.map((contributor) => __awaiter(this, void 0, void 0, function* () {
            // If its the contributor we want to wait for a conclusion on, then we should not detach it
            // Unless we're in a failed state, in which case we should detach it
            if (contributor.channel === (except === null || except === void 0 ? void 0 : except.channel) && this._lifecycle.status !== RoomStatus.Failed) {
                return;
            }
            // If the room's already in the failed state, or it's releasing, we should not detach a failed channel
            if ((this._lifecycle.status === RoomStatus.Failed ||
                this._lifecycle.status === RoomStatus.Releasing ||
                this._lifecycle.status === RoomStatus.Released) &&
                contributor.channel.state === 'failed') {
                this._logger.debug('RoomLifecycleManager._doChannelWindDown(); ignoring failed channel', {
                    channel: contributor.channel.name,
                });
                return;
            }
            try {
                this._logger.debug('RoomLifecycleManager._doChannelWindDown(); detaching', {
                    channel: contributor.channel.name,
                });
                yield contributor.channel.detach();
                this._logger.debug('RoomLifecycleManager._doChannelWindDown(); detached', {
                    channel: contributor.channel.name,
                });
            }
            catch (error) {
                // If the contributor is in a failed state and we're not ignoring failed states, we should fail the room
                if (contributor.channel.state === 'failed' &&
                    this._lifecycle.status !== RoomStatus.Failed &&
                    this._lifecycle.status !== RoomStatus.Releasing &&
                    this._lifecycle.status !== RoomStatus.Released) {
                    const contributorError = new Ably.ErrorInfo('failed to detach feature', contributor.detachmentErrorCode, 500, error);
                    this._lifecycle.setStatus({ status: RoomStatus.Failed, error: contributorError });
                    throw contributorError;
                }
                // We throw an error so that the promise rejects
                throw new Ably.ErrorInfo('detach failure, retry', -1, -1, error);
            }
        })));
    }
    /**
     * Detaches the room. If the room is already detached, this is a no-op.
     * If one of the channels fails to detach, the room status will be set to failed.
     * If the room is in the process of detaching, this will wait for the detachment to complete.
     *
     * @returns A promise that resolves when the room is detached.
     */
    detach() {
        this._logger.trace('RoomLifecycleManager.detach();');
        return this._mtx.runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            // If we're already detached, this is a no-op
            if (this._lifecycle.status === RoomStatus.Detached) {
                return;
            }
            // If the room is released, we can't detach
            if (this._lifecycle.status === RoomStatus.Released) {
                throw new Ably.ErrorInfo('unable to detach room; room is released', ErrorCodes.RoomIsReleased, 500);
            }
            // If the room is releasing, we can't detach
            if (this._lifecycle.status === RoomStatus.Releasing) {
                throw new Ably.ErrorInfo('unable to detach room; room is releasing', ErrorCodes.RoomIsReleasing, 500);
            }
            // If we're in failed, we should not attempt to detach
            if (this._lifecycle.status === RoomStatus.Failed) {
                throw new Ably.ErrorInfo('unable to detach room; room has failed', ErrorCodes.RoomInFailedState, 500);
            }
            // We force the room status to be detaching
            this._startLifecycleOperation();
            this._clearAllTransientDetachTimeouts();
            this._lifecycle.setStatus({ status: RoomStatus.Detaching });
            // We now perform an all-channel wind down.
            // We keep trying until we reach a suitable conclusion.
            return this._doDetach();
        }), LifecycleOperationPrecedence.AttachOrDetach);
    }
    /**
     * Perform a detach.
     *
     * If detaching a channel fails, we should retry until every channel is either in the detached state, or in the failed state.
     */
    _doDetach() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace('RoomLifecycleManager._doDetach();');
            let detachError;
            let done = false;
            while (!done) {
                // First we try to detach all channels, if it fails, then we see if it's an Ably.ErrorInfo with code -1,
                // If it's -1, it means that we need to retry the detach operation
                // If it isn't -1, then we have a failure condition
                try {
                    this._logger.debug('RoomLifecycleManager._doDetach(); detaching all channels');
                    yield this._doChannelWindDown();
                }
                catch (error) {
                    this._logger.error('RoomLifecycleManager._doDetach(); failed to detach all channels', { error });
                    if (error instanceof Ably.ErrorInfo && error.code === -1) {
                        this._logger.debug('RoomLifecycleManager._doDetach(); retrying detach', { error });
                        yield new Promise((resolve) => setTimeout(resolve, 250));
                        continue;
                    }
                    // If we have an error, then this is a failed state error, save it for later
                    if (!detachError) {
                        this._logger.debug('RoomLifecycleManager._doDetach(); channel failed on detach', { error });
                        detachError = error;
                    }
                    // Wait for a short period and then try again to complete the detach
                    yield new Promise((resolve) => setTimeout(resolve, 250));
                    this._logger.debug('RoomLifecycleManager._doDetach(); retrying detach after failed channel');
                    continue;
                }
                // If we've made it this far, then we're done
                done = true;
            }
            // The process is finished, so set operationInProgress to false
            this._endLifecycleOperation();
            // If we aren't in the failed state, then we're detached
            if (this._lifecycle.status !== RoomStatus.Failed) {
                this._lifecycle.setStatus({ status: RoomStatus.Detached });
                return;
            }
            // If we're in the failed state, then we need to throw the error
            throw detachError !== null && detachError !== void 0 ? detachError : new Ably.ErrorInfo('unknown error in _doDetach', ErrorCodes.RoomLifecycleError, 500);
        });
    }
    /**
     * Releases the room. If the room is already released, this is a no-op.
     * Any channel that detaches into the failed state is ok. But any channel that fails to detach
     * will cause the room status to be set to failed.
     *
     * @returns Returns a promise that resolves when the room is released. If a channel detaches into a non-terminated
     * state (e.g. attached), the promise will reject.
     */
    release() {
        this._logger.trace('RoomLifecycleManager.release();');
        return this._mtx.runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            // If we're already released, this is a no-op
            if (this._lifecycle.status === RoomStatus.Released) {
                return;
            }
            // If we're already detached, or we never attached in the first place, then we can transition to released immediately
            if (this._lifecycle.status === RoomStatus.Detached || this._lifecycle.status === RoomStatus.Initialized) {
                this._lifecycle.setStatus({ status: RoomStatus.Released });
                return;
            }
            // If we're in the process of releasing, we should wait for it to complete
            if (this._releaseInProgress) {
                return new Promise((resolve, reject) => {
                    this._lifecycle.onChangeOnce((change) => {
                        if (change.current === RoomStatus.Released) {
                            resolve();
                            return;
                        }
                        this._logger.error('RoomLifecycleManager.release(); expected a non-attached state', change);
                        reject(new Ably.ErrorInfo('failed to release room; existing attempt failed', ErrorCodes.PreviousOperationFailed, 500, change.error));
                    });
                });
            }
            // We force the room status to be releasing
            this._clearAllTransientDetachTimeouts();
            this._startLifecycleOperation();
            this._releaseInProgress = true;
            this._lifecycle.setStatus({ status: RoomStatus.Releasing });
            // Do the release until it completes
            this._logger.debug('RoomLifecycleManager.release(); releasing room');
            return this._releaseChannels();
        }), LifecycleOperationPrecedence.Release);
    }
    /**
     *  Releases the room by detaching all channels. If the release operation fails, we wait
     *  a short period and then try again.
     */
    _releaseChannels() {
        return this._doRelease().catch((error) => {
            this._logger.error('RoomLifecycleManager._releaseChannels(); failed to release room, retrying', { error });
            // Wait a short period and then try again
            return new Promise((resolve) => {
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
    _doRelease() {
        return Promise.all(this._contributors.map((contributor) => __awaiter(this, void 0, void 0, function* () {
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
                yield contributor.channel.detach();
                this._logger.debug('RoomLifecycleManager.release(); detached', {
                    channel: contributor.channel.name,
                });
            }
            catch (error) {
                this._logger.error('RoomLifecycleManager.release(); failed to detach', {
                    error,
                    channel: contributor.channel.name,
                    state: contributor.channel.state,
                });
                throw error;
            }
        }))).then(() => {
            this._releaseInProgress = false;
            this._endLifecycleOperation();
            this._lifecycle.setStatus({ status: RoomStatus.Released });
        });
    }
    /**
     * Starts the room lifecycle operation.
     */
    _startLifecycleOperation() {
        this._logger.debug('RoomLifecycleManager._startLifecycleOperation();');
        this._operationInProgress = true;
    }
    /**
     * Ends the room lifecycle operation.
     */
    _endLifecycleOperation() {
        this._logger.debug('RoomLifecycleManager._endLifecycleOperation();');
        this._operationInProgress = false;
    }
}
//# sourceMappingURL=room-lifecycle-manager.js.map