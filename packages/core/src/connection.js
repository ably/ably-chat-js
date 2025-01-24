import EventEmitter from './utils/event-emitter.js';
/**
 * Default timeout for transient states before we attempt to handle them as a state change.
 */
const TRANSIENT_TIMEOUT = 5000;
/**
 * The different states that the connection can be in through its lifecycle.
 */
export var ConnectionStatus;
(function (ConnectionStatus) {
    /**
     * A temporary state for when the library is first initialized.
     */
    ConnectionStatus["Initialized"] = "initialized";
    /**
     * The library is currently connecting to Ably.
     */
    ConnectionStatus["Connecting"] = "connecting";
    /**
     * The library is currently connected to Ably.
     */
    ConnectionStatus["Connected"] = "connected";
    /**
     * The library is currently disconnected from Ably, but will attempt to reconnect.
     */
    ConnectionStatus["Disconnected"] = "disconnected";
    /**
     * The library is in an extended state of disconnection, but will attempt to reconnect.
     */
    ConnectionStatus["Suspended"] = "suspended";
    /**
     * The library is currently disconnected from Ably and will not attempt to reconnect.
     */
    ConnectionStatus["Failed"] = "failed";
})(ConnectionStatus || (ConnectionStatus = {}));
/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultConnection extends EventEmitter {
    /**
     * Constructs a new `DefaultConnection` instance.
     * @param ably The Ably Realtime client.
     * @param logger The logger to use.
     */
    constructor(ably, logger) {
        super();
        this._status = ConnectionStatus.Initialized;
        this._logger = logger;
        // Set our initial status and error
        this._status = this._mapAblyStatusToChat(ably.connection.state);
        this._error = ably.connection.errorReason;
        // Listen for changes to the connection status
        this._connection = ably.connection;
        this._connection.on((change) => {
            const chatState = this._mapAblyStatusToChat(change.current);
            if (chatState === this._status) {
                return;
            }
            const stateChange = {
                current: chatState,
                previous: this._status,
                error: change.reason,
                retryIn: change.retryIn,
            };
            // If we're in the disconnected state, assume it's transient and set a timeout to propagate the change
            if (chatState === ConnectionStatus.Disconnected && !this._transientTimeout) {
                this._transientTimeout = setTimeout(() => {
                    this._onTransientDisconnectTimeout(stateChange);
                }, TRANSIENT_TIMEOUT);
                return;
            }
            if (this._transientTimeout) {
                // If we're in the connecting state, or disconnected state, and we have a transient timeout, we should ignore it -
                // if we can reach connected in a reasonable time, we can assume the disconnect was transient and suppress the
                // change
                if (chatState === ConnectionStatus.Connecting || chatState === ConnectionStatus.Disconnected) {
                    this._logger.debug('ignoring transient state due to transient disconnect timeout', stateChange);
                    return;
                }
                this._cancelTransientDisconnectTimeout();
            }
            this._applyStatusChange(stateChange);
        });
    }
    /**
     * @inheritdoc
     */
    get status() {
        return this._status;
    }
    /**
     * @inheritdoc
     */
    get error() {
        return this._error;
    }
    /**
     * @inheritdoc
     */
    onStatusChange(listener) {
        this.on(listener);
        return {
            off: () => {
                this.off(listener);
            },
        };
    }
    /**
     * @inheritdoc
     */
    offAllStatusChange() {
        this.off();
    }
    _applyStatusChange(change) {
        this._status = change.current;
        this._error = change.error;
        this._logger.info(`Connection state changed`, change);
        this.emit(change.current, change);
    }
    _mapAblyStatusToChat(status) {
        switch (status) {
            case 'closing':
            case 'closed': {
                return ConnectionStatus.Failed;
            }
            default: {
                return status;
            }
        }
    }
    /**
     * Handles a transient disconnect timeout.
     *
     * @param statusChange The change in status.
     */
    _onTransientDisconnectTimeout(statusChange) {
        this._logger.debug('transient disconnect timeout reached');
        this._cancelTransientDisconnectTimeout();
        // When we apply the status change, we should apply whatever the current state is at the time
        this._applyStatusChange(Object.assign(Object.assign({}, statusChange), { current: this._mapAblyStatusToChat(this._connection.state) }));
    }
    /**
     * Cancels the transient disconnect timeout.
     */
    _cancelTransientDisconnectTimeout() {
        if (this._transientTimeout) {
            clearTimeout(this._transientTimeout);
            this._transientTimeout = undefined;
        }
    }
}
//# sourceMappingURL=connection.js.map