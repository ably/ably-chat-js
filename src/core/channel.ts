import * as Ably from 'ably';

import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

export const getChannel = (name: string, realtime: Ably.Realtime, opts?: Ably.ChannelOptions): Ably.RealtimeChannel => {
  const resolvedOptions = {
    ...opts,
    params: {
      ...opts?.params,
      ...DEFAULT_CHANNEL_OPTIONS.params,
    },
  };

  return realtime.channels.get(name, resolvedOptions);
};

/**
 * Get the channel name for the chat messages channel.
 * @param roomId The room ID.
 * @returns The channel name.
 */
export const messagesChannelName = (roomId: string): string => `${roomId}::$chat::$chatMessages`;
