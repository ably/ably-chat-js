import * as Ably from 'ably';

/**
 * The default values for RoomOptions.
 */
const DefaultRoomOptions = {
  /**
   * The default typing options for a chat room.
   */
  typing: {
    /**
     * The default time that a client will wait after calling typing.start() before emitting a `typing.stopped`
     * event.
     * Restarts the interval with repeated calls to typing.start(), resets the interval with typing.stop().
     *
     * Spec: CHA-T3
     */
    timeoutMs: undefined,

    /**
     * The default time that a client will wait between sending one typing heartbeat and the next.
     *
     * Spec: CHA-T10.
     */
    heartbeatIntervalMs: 15000,

    /**
     * The default timeout for typing inactivity in milliseconds.
     *
     * TODO: Rename this?
     * Spec: CHA-T11
     */
    inactivityTimeoutMs: 500,
  },

  /**
   * The default occupancy options for a chat room.
   */
  occupancy: {
    /**
     * Whether to enable inbound occupancy events.
     */
    enableInboundOccupancy: false,
  },
};

/**
 * Represents the typing options for a chat room.
 */
export interface TypingOptions {
  /**
   * The time, in milliseconds, that a client will wait before emitting a `typing.started` event.
   * If typing.start() is called, the first call will emit an event immediately.
   * Later calls will no-op until the interval has elapsed.
   * Calling typing.stop() will immediately send a `typing.stopped` event and reset the interval,
   * allowing the client to send another `typing.started` event immediately.
   * @defaultValue 17000
   */
  heartbeatIntervalMs?: number;

  /**
   * The optional timeout, in milliseconds, after which a client that pauses typing and does not resume, will emit a `typing.stopped` event.
   * If not set, the client will not emit a `typing.stopped` event until they call `typing.stop()`.
   * @defaultValue undefined
   */
  timeoutMs?: number | undefined;

  /**
   * The time, in milliseconds, a client waits after failing to receive a typing heartbeat from another client before assuming the other client has stopped typing.
   * In practice, this means the client waits the length of the heartbeat interval plus this value before emitting a `typing.stopped` event.
   * @defaultValue 500
   */
  inactivityTimeoutMs?: number;
}

/**
 * Represents the occupancy options for a chat room.
 */
export interface OccupancyOptions {
  /**
   * Whether to enable inbound occupancy events.
   *
   * Note that enabling this feature will increase the number of messages received by the client.
   *
   * @defaultValue false
   */
  enableInboundOccupancy?: boolean;
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
}

/**
 * Represents the normalized typing options for a chat room, which makes every property required
 * except for `timeoutMs`, which is optional.
 */
export type InternalTypingOptions = Omit<Required<TypingOptions>, 'timeoutMs'> & { timeoutMs?: number };

/**
 * Represents the normalized occupancy options for a chat room. Everything becomes required.
 */
export type InternalOccupancyOptions = Required<OccupancyOptions>;

/**
 * Represents the normalized options for a chat room.
 */
export interface InternalRoomOptions {
  /**
   * Are we running the client in a React environment?
   */
  isReactClient: boolean;

  typing: InternalTypingOptions;
  occupancy: InternalOccupancyOptions;
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
  if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
    throw invalidRoomConfiguration('typing timeout must be greater than 0');
  }
  if (options.heartbeatIntervalMs !== undefined && options.heartbeatIntervalMs <= 0) {
    throw invalidRoomConfiguration('typing heartbeat interval must be greater than 0');
  }
  if (options.inactivityTimeoutMs !== undefined && options.inactivityTimeoutMs <= 0) {
    throw invalidRoomConfiguration('typing inactivity timeout must be greater than 0');
  }
};

export const normalizeTypingOptions = (options: RoomOptions | undefined): InternalTypingOptions => {
  return {
    ...DefaultRoomOptions.typing,
    ...options?.typing,
  };
};

export const normalizeOccupancyOptions = (options: RoomOptions | undefined): InternalOccupancyOptions => {
  return {
    ...DefaultRoomOptions.occupancy,
    ...options?.occupancy,
  };
};

export const normalizeRoomOptions = (options: RoomOptions | undefined, react: boolean): InternalRoomOptions => {
  return {
    typing: normalizeTypingOptions(options),
    occupancy: normalizeOccupancyOptions(options),
    isReactClient: react,
  };
};
