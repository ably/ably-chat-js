var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { dequal } from 'dequal';
import { newDiscontinuityEmitter, } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { TypingEvents } from './events.js';
import { addListenerToChannelPresenceWithoutAttach } from './realtime-extensions.js';
import EventEmitter from './utils/event-emitter.js';
const PRESENCE_GET_RETRY_INTERVAL_MS = 1500; // base retry interval, we double it each time
const PRESENCE_GET_RETRY_MAX_INTERVAL_MS = 30000; // max retry interval
const PRESENCE_GET_MAX_RETRIES = 5; // max num of retries
/**
 * @inheritDoc
 */
export class DefaultTyping extends EventEmitter {
    /**
     * Constructs a new `DefaultTyping` instance.
     * @param roomId The unique identifier of the room.
     * @param options The options for typing in the room.
     * @param channelManager The channel manager for the room.
     * @param clientId The client ID of the user.
     * @param logger An instance of the Logger.
     */
    constructor(roomId, options, channelManager, clientId, logger) {
        super();
        this._discontinuityEmitter = newDiscontinuityEmitter();
        this._receivedEventNumber = 0;
        this._triggeredEventNumber = 0;
        this._currentlyTyping = new Set();
        this._numRetries = 0;
        /**
         * Subscribe to internal events. This will listen to presence events and convert them into associated typing events,
         * while also updating the currentlyTypingClientIds set.
         */
        this._internalSubscribeToEvents = (member) => {
            if (!member.clientId) {
                this._logger.error(`unable to handle typing event; no clientId`, { member });
                return;
            }
            this._receivedEventNumber += 1;
            // received a real event, cancelling retry timeout
            if (this._retryTimeout) {
                clearTimeout(this._retryTimeout);
                this._retryTimeout = undefined;
                this._numRetries = 0;
            }
            this._getAndEmit(this._receivedEventNumber);
        };
        this._clientId = clientId;
        this._channel = this._makeChannel(roomId, channelManager);
        // Timeout for typing
        this._typingTimeoutMs = options.timeoutMs;
        this._logger = logger;
    }
    /**
     * Creates the realtime channel for typing indicators.
     */
    _makeChannel(roomId, channelManager) {
        const channel = channelManager.get(`${roomId}::$chat::$typingIndicators`);
        addListenerToChannelPresenceWithoutAttach({
            listener: this._internalSubscribeToEvents.bind(this),
            channel: channel,
        });
        return channel;
    }
    /**
     * @inheritDoc
     */
    get() {
        this._logger.trace(`DefaultTyping.get();`);
        return this._channel.presence.get().then((members) => new Set(members.map((m) => m.clientId)));
    }
    /**
     * @inheritDoc
     */
    get channel() {
        return this._channel;
    }
    /**
     * Start the typing timeout timer. This will emit a typingStopped event if the timer expires.
     */
    _startTypingTimer() {
        this._logger.trace(`DefaultTyping.startTypingTimer();`);
        this._timerId = setTimeout(() => {
            this._logger.debug(`DefaultTyping.startTypingTimer(); timeout expired`);
            void this.stop();
        }, this._typingTimeoutMs);
    }
    /**
     * @inheritDoc
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace(`DefaultTyping.start();`);
            // If the user is already typing, reset the timer
            if (this._timerId) {
                this._logger.debug(`DefaultTyping.start(); already typing, resetting timer`);
                clearTimeout(this._timerId);
                this._startTypingTimer();
                return;
            }
            // Start typing and emit typingStarted event
            this._startTypingTimer();
            return this._channel.presence.enterClient(this._clientId);
        });
    }
    /**
     * @inheritDoc
     */
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            this._logger.trace(`DefaultTyping.stop();`);
            // Clear the timer and emit typingStopped event
            if (this._timerId) {
                clearTimeout(this._timerId);
                this._timerId = undefined;
            }
            // Will throw an error if the user is not typing
            return this._channel.presence.leaveClient(this._clientId);
        });
    }
    /**
     * @inheritDoc
     */
    subscribe(listener) {
        this._logger.trace(`DefaultTyping.subscribe();`);
        this.on(listener);
        return {
            unsubscribe: () => {
                this._logger.trace('DefaultTyping.unsubscribe();');
                this.off(listener);
            },
        };
    }
    /**
     * @inheritDoc
     */
    unsubscribeAll() {
        this._logger.trace(`DefaultTyping.unsubscribeAll();`);
        this.off();
    }
    _getAndEmit(eventNum) {
        this.get()
            .then((currentlyTyping) => {
            // successful fetch, remove retry timeout if one exists
            if (this._retryTimeout) {
                clearTimeout(this._retryTimeout);
                this._retryTimeout = undefined;
                this._numRetries = 0;
            }
            // if we've seen the result of a newer promise, do nothing
            if (this._triggeredEventNumber >= eventNum) {
                return;
            }
            this._triggeredEventNumber = eventNum;
            // if current typers haven't changed since we last emitted, do nothing
            if (dequal(this._currentlyTyping, currentlyTyping)) {
                return;
            }
            this._currentlyTyping = currentlyTyping;
            this.emit(TypingEvents.Changed, {
                currentlyTyping: new Set(currentlyTyping),
            });
        })
            .catch((error) => {
            const willReattempt = this._numRetries < PRESENCE_GET_MAX_RETRIES;
            this._logger.error(`Error fetching currently typing clientIds set.`, {
                error,
                willReattempt: willReattempt,
            });
            if (!willReattempt) {
                return;
            }
            // already another timeout, do nothing
            if (this._retryTimeout) {
                return;
            }
            const waitBeforeRetry = Math.min(PRESENCE_GET_RETRY_MAX_INTERVAL_MS, PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, this._numRetries));
            this._numRetries += 1;
            this._retryTimeout = setTimeout(() => {
                this._retryTimeout = undefined;
                this._receivedEventNumber++;
                this._getAndEmit(this._receivedEventNumber);
            }, waitBeforeRetry);
        });
    }
    onDiscontinuity(listener) {
        this._logger.trace(`DefaultTyping.onDiscontinuity();`);
        this._discontinuityEmitter.on(listener);
        return {
            off: () => {
                this._discontinuityEmitter.off(listener);
            },
        };
    }
    discontinuityDetected(reason) {
        this._logger.warn(`DefaultTyping.discontinuityDetected();`, { reason });
        this._discontinuityEmitter.emit('discontinuity', reason);
    }
    get timeoutMs() {
        return this._typingTimeoutMs;
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode() {
        return ErrorCodes.TypingAttachmentFailed;
    }
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode() {
        return ErrorCodes.TypingDetachmentFailed;
    }
}
//# sourceMappingURL=typing.js.map