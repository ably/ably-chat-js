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
  } as PresenceOptions,

  /**
   * The default typing options for a chat room.
   */
  typing: {
    /**
     * The default timeout for typing events in milliseconds.
     */
    timeoutMs: 10000,
  } as TypingOptions,

  /**
   * The default reactions options for a chat room.
   */
  reactions: {} as RoomReactionsOptions,

  /**
   * The default occupancy options for a chat room.
   */
  occupancy: {} as OccupancyOptions,
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
   * @defaultValue 10000
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

/**
 * Creates an {@link ErrorInfo} for invalid room configuration.
 *
 * @param reason The reason for the invalid room configuration.
 * @returns An ErrorInfo.
 */
const invalidRoomConfiguration = (reason: string): Error =>
  new Ably.ErrorInfo(`invalid room configuration: ${reason}`, 40001, 400);

export const validateRoomOptions = (options: RoomOptions): void => {
  if (options.typing && options.typing.timeoutMs <= 0) {
    throw invalidRoomConfiguration('typing timeout must be greater than 0');
  }
};
