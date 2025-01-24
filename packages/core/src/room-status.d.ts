import * as Ably from 'ably';
/**
 * The different states that a room can be in throughout its lifecycle.
 */
export declare enum RoomStatus {
    /**
     * The library is currently initializing the room. This state is a temporary state used in React prior
     * to the room being resolved.
     */
    Initializing = "initializing",
    /**
     * A temporary state for when the room object is first initialized.
     */
    Initialized = "initialized",
    /**
     * The library is currently attempting to attach the room.
     */
    Attaching = "attaching",
    /**
     * The room is currently attached and receiving events.
     */
    Attached = "attached",
    /**
     * The room is currently detaching and will not receive events.
     */
    Detaching = "detaching",
    /**
     * The room is currently detached and will not receive events.
     */
    Detached = "detached",
    /**
     * The room is in an extended state of detachment, but will attempt to re-attach when able.
     */
    Suspended = "suspended",
    /**
     * The room is currently detached and will not attempt to re-attach. User intervention is required.
     */
    Failed = "failed",
    /**
     * The room is in the process of releasing. Attempting to use a room in this state may result in undefined behavior.
     */
    Releasing = "releasing",
    /**
     * The room has been released and is no longer usable.
     */
    Released = "released"
}
/**
 * Represents a change in the status of the room.
 */
export interface RoomStatusChange {
    /**
     * The new status of the room.
     */
    current: RoomStatus;
    /**
     * The previous status of the room.
     */
    previous: RoomStatus;
    /**
     * An error that provides a reason why the room has
     * entered the new status, if applicable.
     */
    error?: Ably.ErrorInfo;
}
/**
 * A function that can be called when the room status changes.
 * @param change The change in status.
 */
export type RoomStatusListener = (change: RoomStatusChange) => void;
/**
 * The response from the `onChange` method.
 */
export interface OnRoomStatusChangeResponse {
    /**
     * Unregisters the listener that was added by the `onChange` method.
     */
    off: () => void;
}
/**
 * Represents the status of a Room.
 */
export interface RoomLifecycle {
    /**
     * The current status of the room.
     */
    get status(): RoomStatus;
    /**
     * The current error, if any, that caused the room to enter the current status.
     */
    get error(): Ably.ErrorInfo | undefined;
    /**
     * Registers a listener that will be called whenever the room status changes.
     * @param listener The function to call when the status changes.
     * @returns An object that can be used to unregister the listener.
     */
    onChange(listener: RoomStatusListener): OnRoomStatusChangeResponse;
    /**
     * Removes all listeners that were added by the `onChange` method.
     */
    offAll(): void;
}
/**
 * A new room status that can be set.
 */
export interface NewRoomStatus {
    /**
     * The new status of the room.
     */
    status: RoomStatus;
    /**
     * An error that provides a reason why the room has
     * entered the new status, if applicable.
     */
    error?: Ably.ErrorInfo;
}
