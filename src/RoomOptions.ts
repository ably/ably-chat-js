import * as Ably from 'ably';

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
export interface TypingOptions {
  /**
   * The timeout for typing events in milliseconds. If typing.start() is not called for this amount of time, a stop
   * typing event will be fired, resulting in the user being removed from the currently typing set.
   * @defaultValue 10000
   */
  timeoutMs: number;
}

/**
 * The default typing options.
 */
export const DefaultTypingOptions: TypingOptions = {
  timeoutMs: 10000,
};

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

/**
 * Creates an errorinfo for invalid room configuration.
 *
 * @param reason The reason for the invalid room configuration.
 * @returns An ErrorInfo.
 */
const invalidRoomConfiguration = (reason: string): Error =>
  new Ably.ErrorInfo(`invalid room configuration: ${reason}`, 40001, 400);

export const validateRoomOptions = (options: RoomOptions): void => {
  if (options.typing) {
    if (options.typing.timeoutMs <= 0) {
      throw invalidRoomConfiguration('typing timeout must be greater than 0');
    }
  }
};
