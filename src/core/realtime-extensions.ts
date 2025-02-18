import * as Ably from 'ably';

/**
 * Exposes the agents option in the Ably Realtime client for typescript.
 *
 * @internal
 */
export interface RealtimeWithOptions extends Ably.Realtime {
  options: {
    agents?: Record<string, string | undefined>;
  };
}

/**
 * Exposes the channelOptions property in the Ably Realtime channel for typescript.
 *
 * @internal
 */
export interface RealtimeChannelWithOptions extends Ably.RealtimeChannel {
  channelOptions: Ably.ChannelOptions;
}
