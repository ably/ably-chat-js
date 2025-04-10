import * as Ably from 'ably';

/**
 * The default values for RoomOptions.
 */
const DefaultRoomOptions: Omit<InternalRoomOptions, 'isReactClient'> = {
  /**
   * The default typing options for a chat room.
   */
  typing: {
    /**
     * The default time that a client will wait between sending one typing heartbeat and the next.
     *
     * Spec: CHA-T10.
     */
    heartbeatThrottleMs: 10000,
  },

  /**
   * The default occupancy options for a chat room.
   */
  occupancy: {
    /**
     * Whether to enable occupancy events.
     */
    enableOccupancyEvents: false,
  },

  /**
   * The default presence options for the room.
   */
  presence: {
    enablePresenceEvents: true,
  },
};

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
  heartbeatThrottleMs?: number;
}

/**
 * Represents the occupancy options for a chat room.
 */
export interface OccupancyOptions {
  /**
   * Whether to enable occupancy events.
   *
   * Note that enabling this feature will increase the number of messages received by the client as additional
   * messages will be sent by the server to indicate occupancy changes.
   *
   * @defaultValue false
   */
  enableOccupancyEvents?: boolean;
}

/**
 * Represents the presence options for a chat room.
 */
export interface PresenceOptions {
  /**
   * Whether or not the client should receive presence events from the server. This setting
   * can be disabled if you are using presence in your Chat Room, but this particular client does not
   * need to receive the messages.
   *
   * @defaultValue true
   */
  enablePresenceEvents?: boolean;
}

/**
 * Represents the options for a given chat room.
 */
export interface RoomOptions {
  /**
   * The typing options for the room.
   */
  typing?: TypingOptions;

  /**
   * The occupancy options for the room.
   */
  occupancy?: OccupancyOptions;

  /**
   * The presence options for the room.
   */
  presence?: PresenceOptions;
}

/**
 * Represents the normalized typing options for a chat room, which makes every property required.
 */
export type InternalTypingOptions = Required<TypingOptions>;

/**
 * Represents the normalized occupancy options for a chat room. Everything becomes required.
 */
export type InternalOccupancyOptions = Required<OccupancyOptions>;

/**
 * Represents the normalized presence options for a chat room. Everything becomes required.
 */
export type InternalPresenceOptions = Required<PresenceOptions>;

/**
 * Represents the normalized options for a chat room.
 */
export interface InternalRoomOptions {
  /**
   * Are we running the client in a React environment?
   */
  isReactClient: boolean;

  /**
   * Typing options with everything made mandatory.
   */
  typing: InternalTypingOptions;

  /**
   * Occupancy options with everything made mandatory.
   */
  occupancy: InternalOccupancyOptions;

  /**
   * Presence options with everything made mandatory.
   */
  presence: InternalPresenceOptions;
}

/**
 * Creates an {@link ErrorInfo} for invalid room configuration.
 *
 * @param reason The reason for the invalid room configuration.
 * @returns An ErrorInfo.
 */
const invalidRoomConfiguration = (reason: string): Error =>
  new Ably.ErrorInfo(`invalid room configuration: ${reason}`, 40001, 400);

export const validateRoomOptions = (options: InternalRoomOptions): void => {
  validateTypingOptions(options.typing);
};

const validateTypingOptions = (options: InternalTypingOptions): void => {
  if (options.heartbeatThrottleMs <= 0) {
    throw invalidRoomConfiguration('typing heartbeat interval must be greater than 0');
  }
};

const normalizeTypingOptions = (options: RoomOptions | undefined): InternalTypingOptions => {
  return {
    ...DefaultRoomOptions.typing,
    ...options?.typing,
  };
};

const normalizeOccupancyOptions = (options: RoomOptions | undefined): InternalOccupancyOptions => {
  return {
    ...DefaultRoomOptions.occupancy,
    ...options?.occupancy,
  };
};

const normalizePresenceOptions = (options: RoomOptions | undefined): InternalPresenceOptions => {
  return {
    ...DefaultRoomOptions.presence,
    ...options?.presence,
  };
};

export const normalizeRoomOptions = (options: RoomOptions | undefined, react: boolean): InternalRoomOptions => {
  return {
    typing: normalizeTypingOptions(options),
    occupancy: normalizeOccupancyOptions(options),
    presence: normalizePresenceOptions(options),
    isReactClient: react,
  };
};
