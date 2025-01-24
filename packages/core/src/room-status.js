import EventEmitter from './utils/event-emitter.js';
/**
 * The different states that a room can be in throughout its lifecycle.
 */
export var RoomStatus;
(function (RoomStatus) {
    /**
     * The library is currently initializing the room. This state is a temporary state used in React prior
     * to the room being resolved.
     */
    RoomStatus["Initializing"] = "initializing";
    /**
     * A temporary state for when the room object is first initialized.
     */
    RoomStatus["Initialized"] = "initialized";
    /**
     * The library is currently attempting to attach the room.
     */
    RoomStatus["Attaching"] = "attaching";
    /**
     * The room is currently attached and receiving events.
     */
    RoomStatus["Attached"] = "attached";
    /**
     * The room is currently detaching and will not receive events.
     */
    RoomStatus["Detaching"] = "detaching";
    /**
     * The room is currently detached and will not receive events.
     */
    RoomStatus["Detached"] = "detached";
    /**
     * The room is in an extended state of detachment, but will attempt to re-attach when able.
     */
    RoomStatus["Suspended"] = "suspended";
    /**
     * The room is currently detached and will not attempt to re-attach. User intervention is required.
     */
    RoomStatus["Failed"] = "failed";
    /**
     * The room is in the process of releasing. Attempting to use a room in this state may result in undefined behavior.
     */
    RoomStatus["Releasing"] = "releasing";
    /**
     * The room has been released and is no longer usable.
     */
    RoomStatus["Released"] = "released";
})(RoomStatus || (RoomStatus = {}));
/**
 * An implementation of the `Status` interface.
 * @internal
 */
export class DefaultRoomLifecycle extends EventEmitter {
    /**
     * Constructs a new `DefaultStatus` instance.
     * @param logger The logger to use.
     */
    constructor(roomId, logger) {
        super();
        this._status = RoomStatus.Initialized;
        this._internalEmitter = new EventEmitter();
        this._roomId = roomId;
        this._logger = logger;
        this._status = RoomStatus.Initialized;
        this._error = undefined;
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
    onChange(listener) {
        this.on(listener);
        return {
            off: () => {
                this.off(listener);
            },
        };
    }
    onChangeOnce(listener) {
        this._internalEmitter.once(listener);
    }
    /**
     * @inheritdoc
     */
    offAll() {
        this.off();
    }
    setStatus(params) {
        const change = {
            current: params.status,
            error: params.error,
            previous: this._status,
        };
        this._status = change.current;
        this._error = change.error;
        this._logger.info(`room status changed`, Object.assign(Object.assign({}, change), { roomId: this._roomId }));
        this._internalEmitter.emit(change.current, change);
        this.emit(change.current, change);
    }
}
//# sourceMappingURL=room-status.js.map