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
 * The default presence options.
 */
export const DefaultPresenceOptions: PresenceOptions = {
  enter: true,
  subscribe: true,
};

/**
 * Represents the typing options for a chat room.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TypingOptions {}

/**
 * The default typing options.
 */
export const DefaultTypingOptions: TypingOptions = {};

/**
 * Represents the reactions options for a chat room.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ReactionsOptions {}

/**
 * The default reactions options.
 */
export const DefaultReactionsOptions: ReactionsOptions = {};

/**
 * Represents the occupancy options for a chat room.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OccupancyOptions {}

/**
 * The default occupancy options.
 */
export const DefaultOccupancyOptions: OccupancyOptions = {};

/**
 * Represents the options for a given chat room.
 */
export interface RoomOptions {
  /**
   * The presence options for the room. To enable presence in the room, set this property. You may
   * use {@link DefaultPresenceOptions} to enable presence with default options.
   * @defaultValue undefined
   */
  presence?: PresenceOptions;

  /**
   * The typing options for the room. To enable typing in the room, set this property. You may use
   * {@link DefaultTypingOptions} to enable typing with default options.
   */
  typing?: TypingOptions;

  /**
   * The reactions options for the room. To enable reactions in the room, set this property. You may use
   * {@link DefaultReactionsOptions} to enable reactions with default options.
   */
  reactions?: ReactionsOptions;

  /**
   * The occupancy options for the room. To enable occupancy in the room, set this property. You may use
   * {@link DefaultOccupancyOptions} to enable occupancy with default options.
   */
  occupancy?: OccupancyOptions;
}
