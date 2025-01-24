/**
 * Represents the default options for a chat room.
 */
export declare const RoomOptionsDefaults: {
    /**
     * The default presence options for a chat room.
     */
    presence: PresenceOptions;
    /**
     * The default typing options for a chat room.
     */
    typing: TypingOptions;
    /**
     * The default reactions options for a chat room.
     */
    reactions: RoomReactionsOptions;
    /**
     * The default occupancy options for a chat room.
     */
    occupancy: OccupancyOptions;
};
/**
 * Represents the presence options for a chat room.
 */
export interface PresenceOptions {
    /**
     * Whether the underlying Realtime channel should use the presence enter mode, allowing entry into presence.
     * This property does not affect the presence lifecycle, and users must still call {@link Presence.enter}
     * in order to enter presence.
     * @defaultValue true
     */
    enter?: boolean;
    /**
     * Whether the underlying Realtime channel should use the presence subscribe mode, allowing subscription to presence.
     * This property does not affect the presence lifecycle, and users must still call {@link Presence.subscribe}
     * in order to subscribe to presence.
     * @defaultValue true
     */
    subscribe?: boolean;
}
/**
 * Represents the typing options for a chat room.
 */
export interface TypingOptions {
    /**
     * The timeout for typing events in milliseconds. If typing.start() is not called for this amount of time, a stop
     * typing event will be fired, resulting in the user being removed from the currently typing set.
     * @defaultValue 5000
     */
    timeoutMs: number;
}
/**
 * Represents the reactions options for a chat room.
 */
export type RoomReactionsOptions = object;
/**
 * Represents the occupancy options for a chat room.
 */
export type OccupancyOptions = object;
/**
 * Represents the options for a given chat room.
 */
export interface RoomOptions {
    /**
     * The presence options for the room. To enable presence in the room, set this property. You may
     * use {@link RoomOptionsDefaults.presence} to enable presence with default options.
     * @defaultValue undefined
     */
    presence?: PresenceOptions;
    /**
     * The typing options for the room. To enable typing in the room, set this property. You may use
     * {@link RoomOptionsDefaults.typing} to enable typing with default options.
     */
    typing?: TypingOptions;
    /**
     * The reactions options for the room. To enable reactions in the room, set this property. You may use
     * {@link RoomOptionsDefaults.reactions} to enable reactions with default options.
     */
    reactions?: RoomReactionsOptions;
    /**
     * The occupancy options for the room. To enable occupancy in the room, set this property. You may use
     * {@link RoomOptionsDefaults.occupancy} to enable occupancy with default options.
     */
    occupancy?: OccupancyOptions;
}
export declare const validateRoomOptions: (options: RoomOptions) => void;
