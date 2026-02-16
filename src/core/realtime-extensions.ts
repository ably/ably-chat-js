import * as Ably from 'ably';

import { Headers } from './headers.js';

/**
 * Exposes the agents option in the Ably Realtime client for typescript.
 * @internal
 */
export interface RealtimeWithOptions extends Ably.Realtime {
  options: {
    agents?: Record<string, string | undefined>;
  };
}

/**
 * Exposes the channelOptions property in the Ably Realtime channel for typescript.
 * @internal
 */
export interface RealtimeChannelWithOptions extends Ably.RealtimeChannel {
  channelOptions: Ably.ChannelOptions;
}

/**
 * Represents the typed shape of the `extras` object on Ably realtime messages,
 * presence messages, and annotations. Ably's types declare `extras` as `any`,
 * so this interface provides a concrete type for the fields we use.
 * @internal
 */
export interface RealtimeExtras {
  headers?: Headers;
  userClaim?: string;
}

/**
 * Safely extracts the `extras` object from an Ably message, presence message,
 * or annotation. Returns an empty object if `extras` is not a valid object.
 * @param extras The raw extras value from an Ably message.
 * @returns The typed extras object.
 * @internal
 */
export const realtimeExtras = (extras: unknown): RealtimeExtras => {
  if (!extras || typeof extras !== 'object') {
    return {};
  }
  const raw = extras as Record<string, unknown>;
  const result: RealtimeExtras = {};
  if (raw.headers && typeof raw.headers === 'object') {
    result.headers = raw.headers as RealtimeExtras['headers'];
  }
  if (typeof raw.userClaim === 'string') {
    result.userClaim = raw.userClaim;
  }
  return result;
};
