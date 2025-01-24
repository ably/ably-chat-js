import * as Ably from 'ably';
/**
 * The different states that the connection can be in through its lifecycle.
 */
export declare enum ConnectionStatus {
    /**
     * A temporary state for when the library is first initialized.
     */
    Initialized = "initialized",
    /**
     * The library is currently connecting to Ably.
     */
    Connecting = "connecting",
    /**
     * The library is currently connected to Ably.
     */
    Connected = "connected",
    /**
     * The library is currently disconnected from Ably, but will attempt to reconnect.
     */
    Disconnected = "disconnected",
    /**
     * The library is in an extended state of disconnection, but will attempt to reconnect.
     */
    Suspended = "suspended",
    /**
     * The library is currently disconnected from Ably and will not attempt to reconnect.
     */
    Failed = "failed"
}
/**
 * Represents a change in the status of the connection.
 */
export interface ConnectionStatusChange {
    /**
     * The new status of the connection.
     */
    current: ConnectionStatus;
    /**
     * The previous status of the connection.
     */
    previous: ConnectionStatus;
    /**
     * An error that provides a reason why the connection has
     * entered the new status, if applicable.
     */
    error?: Ably.ErrorInfo;
    /**
     * The time in milliseconds that the client will wait before attempting to reconnect.
     */
    retryIn?: number;
}
/**
 * A function that can be called when the connection status changes.
 * @param change The change in status.
 */
export type ConnectionStatusListener = (change: ConnectionStatusChange) => void;
/**
 * The response from the `onStatusChange` method.
 */
export interface OnConnectionStatusChangeResponse {
    /**
     * Unregisters the listener that was added by the `onStatusChange` method.
     */
    off: () => void;
}
/**
 * Represents a connection to Ably.
 */
export interface Connection {
    /**
     * The current status of the connection.
     */
    get status(): ConnectionStatus;
    /**
     * The current error, if any, that caused the connection to enter the current status.
     */
    get error(): Ably.ErrorInfo | undefined;
    /**
     * Registers a listener that will be called whenever the connection status changes.
     * @param listener The function to call when the status changes.
     * @returns An object that can be used to unregister the listener.
     */
    onStatusChange(listener: ConnectionStatusListener): OnConnectionStatusChangeResponse;
    /**
     * Removes all listeners that were added by the `onStatusChange` method.
     */
    offAllStatusChange(): void;
}
