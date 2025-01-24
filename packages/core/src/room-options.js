import * as Ably from 'ably';
/**
 * Represents the default options for a chat room.
 */
export const RoomOptionsDefaults = {
    /**
     * The default presence options for a chat room.
     */
    presence: {
        /**
         * The client should be able to enter presence.
         */
        enter: true,
        /**
         * The client should be able to subscribe to presence.
         */
        subscribe: true,
    },
    /**
     * The default typing options for a chat room.
     */
    typing: {
        /**
         * The default timeout for typing events in milliseconds.
         */
        timeoutMs: 5000,
    },
    /**
     * The default reactions options for a chat room.
     */
    reactions: {},
    /**
     * The default occupancy options for a chat room.
     */
    occupancy: {},
};
/**
 * Creates an {@link ErrorInfo} for invalid room configuration.
 *
 * @param reason The reason for the invalid room configuration.
 * @returns An ErrorInfo.
 */
const invalidRoomConfiguration = (reason) => new Ably.ErrorInfo(`invalid room configuration: ${reason}`, 40001, 400);
export const validateRoomOptions = (options) => {
    if (options.typing && options.typing.timeoutMs <= 0) {
        throw invalidRoomConfiguration('typing timeout must be greater than 0');
    }
};
//# sourceMappingURL=room-options.js.map