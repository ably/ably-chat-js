import * as Ably from 'ably';

/**
 * A set of example options for a Chat room that enables all features, this is
 * useful for testing and demonstration purposes.
 */
export const AllFeaturesEnabled = {
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
     * The default time that a client will wait between sending one typing heartbeat and the next.
     *
     * Spec: CHA-T10.
     */
    heartbeatThrottleMs: 15000,
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
   * A throttle, in milliseconds, that enforces the minimum time interval between consecutive `typing.started`
   * events sent by the client to the server.
   * If typing.start() is called, the first call will emit an event immediately.
   * Later calls will no-op until the time has elapsed.
   * Calling typing.stop() will immediately send a `typing.stopped` event to the server and reset the interval,
   * allowing the client to send another `typing.started` event immediately.
   * @defaultValue 10000
   */
  heartbeatThrottleMs: number;
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
   * use {@link AllFeaturesEnabled.presence} to enable presence with default options.
   * @defaultValue undefined
   */
  presence?: PresenceOptions;

  /**
   * The typing options for the room. To enable typing in the room, set this property. You may use
   * {@link AllFeaturesEnabled.typing} to enable typing with default options.
   */
  typing?: TypingOptions;

  /**
   * The reactions options for the room. To enable reactions in the room, set this property. You may use
   * {@link AllFeaturesEnabled.reactions} to enable reactions with default options.
   */
  reactions?: RoomReactionsOptions;

  /**
   * The occupancy options for the room. To enable occupancy in the room, set this property. You may use
   * {@link AllFeaturesEnabled.occupancy} to enable occupancy with default options.
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
  if (options.typing) {
    validateTypingOptions(options.typing);
  }
};

const validateTypingOptions = (options: TypingOptions): void => {
  if (options.heartbeatThrottleMs <= 0) {
    throw invalidRoomConfiguration('typing heartbeat interval must be greater than 0');
  }
};

export const normalizeRoomOptions = (options: RoomOptions, react: boolean): NormalizedRoomOptions => {
  return {
    ...options,
    isReactClient: react,
  };
};
