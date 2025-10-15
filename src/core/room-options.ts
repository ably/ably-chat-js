import * as Ably from 'ably';

import { ErrorCode } from './errors.js';
import { MessageReactionType } from './events.js';

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
    enableEvents: false,
  },

  /**
   * The default presence options for the room.
   */
  presence: {
    enableEvents: true,
  },

  /**
   * The default options for messages.
   */
  messages: {
    rawMessageReactions: false,
    defaultMessageReactionType: MessageReactionType.Distinct,
  },
};

/**
 * Represents the message options for a chat room.
 */
export interface MessagesOptions {
  /**
   * Whether to enable receiving raw individual message reactions from the
   * realtime channel. Set to true if subscribing to raw message reactions.
   *
   * Note reaction summaries (aggregates) are always available regardless of
   * this setting.
   * @defaultValue false
   */
  rawMessageReactions?: boolean;

  /**
   * The default message reaction type to use for sending message reactions.
   *
   * Any message reaction type can be sent regardless of this setting by specifying the `type` parameter
   * in the {@link MessageReactions.send} method.
   * @defaultValue {@link MessageReactionType.Distinct}
   */
  defaultMessageReactionType?: MessageReactionType;
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
   * @defaultValue false
   */
  enableEvents?: boolean;
}

/**
 * Represents the presence options for a chat room.
 */
export interface PresenceOptions {
  /**
   * Whether or not the client should receive presence events from the server. This setting
   * can be disabled if you are using presence in your Chat Room, but this particular client does not
   * need to receive the messages.
   * @defaultValue true
   */
  enableEvents?: boolean;
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

  /**
   * The message options for the room.
   */
  messages?: MessagesOptions;
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
 * Represents the normalized message options for a chat room. Everything becomes required.
 */
export type InternalMessagesOptions = Required<MessagesOptions>;

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

  /**
   * Message options with everything made mandatory.
   */
  messages: InternalMessagesOptions;
}

/**
 * Creates an {@link ErrorInfo} for invalid room configuration.
 * @param reason The reason for the invalid room configuration.
 * @returns An ErrorInfo.
 */
const invalidRoomConfiguration = (reason: string): Error =>
  new Ably.ErrorInfo(`unable to create room; invalid room configuration: ${reason}`, ErrorCode.InvalidArgument, 400);

export const validateRoomOptions = (options: InternalRoomOptions): void => {
  validateTypingOptions(options.typing);
};

const validateTypingOptions = (options: InternalTypingOptions): void => {
  if (options.heartbeatThrottleMs <= 0) {
    throw invalidRoomConfiguration('typing heartbeat interval must be greater than 0');
  }
};

const normalizeTypingOptions = (options: RoomOptions | undefined): InternalTypingOptions => ({
  ...DefaultRoomOptions.typing,
  ...options?.typing,
});

const normalizeOccupancyOptions = (options: RoomOptions | undefined): InternalOccupancyOptions => ({
  ...DefaultRoomOptions.occupancy,
  ...options?.occupancy,
});

const normalizePresenceOptions = (options: RoomOptions | undefined): InternalPresenceOptions => ({
  ...DefaultRoomOptions.presence,
  ...options?.presence,
});

const normalizeMessagesOptions = (options: RoomOptions | undefined): InternalMessagesOptions => ({
  ...DefaultRoomOptions.messages,
  ...options?.messages,
});

export const normalizeRoomOptions = (options: RoomOptions | undefined, react: boolean): InternalRoomOptions => ({
  typing: normalizeTypingOptions(options),
  occupancy: normalizeOccupancyOptions(options),
  presence: normalizePresenceOptions(options),
  messages: normalizeMessagesOptions(options),
  isReactClient: react,
});
