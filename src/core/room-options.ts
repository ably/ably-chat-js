import * as Ably from 'ably';

/**
 * Represents the default options for typing in a chat room.
 */
export const TypingOptionsDefaults = {
  timeoutMs: 5000,
};

/**
 * Represents the default options for a chat room.
 */
export const DefaultRoomOptions = {
  /**
   * The default presence options for a chat room.
   * Includes default options for entering/subscribing to presence and typing timeout.
   */
  presence: {
    typingOptions: TypingOptionsDefaults,
    enter: true,
    subscribe: true,
  },

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
   * The typing options for the room.
   */
  typingOptions?: TypingOptions;

  /**
   * Determines whether the user should be allowed to enter the room.
   */
  enter?: boolean;

  /**
   * Determines whether the user should be allowed to subscribe to presence events in the room.
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
   * use {@link DefaultRoomOptions.presence} to enable presence with default options.
   * @defaultValue undefined
   */
  presence?: PresenceOptions;

  /**
   * The typing options for the room. To enable typing in the room, set this property. You may use
   * {@link DefaultRoomOptions.typing} to enable typing with default options.
   */
  typing?: TypingOptions;

  /**
   * The reactions options for the room. To enable reactions in the room, set this property. You may use
   * {@link DefaultRoomOptions.reactions} to enable reactions with default options.
   */
  reactions?: RoomReactionsOptions;

  /**
   * The occupancy options for the room. To enable occupancy in the room, set this property. You may use
   * {@link DefaultRoomOptions.occupancy} to enable occupancy with default options.
   */
  occupancy?: OccupancyOptions;
}

/**
 * Represents the normalized options for a chat room.
 */
export interface NormalizedRoomOptions extends RoomOptions {
  /**
   * Are we running the client in a React environment?
   */
  isReactClient: boolean;
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
  if (options.presence?.typingOptions?.timeoutMs && options.presence.typingOptions.timeoutMs <= 0) {
    throw invalidRoomConfiguration('typing timeout must be greater than 0');
  }
};

export const normalizeRoomOptions = (options: RoomOptions, react: boolean): NormalizedRoomOptions => {
  return {
    ...options,
    isReactClient: react,
  };
};
