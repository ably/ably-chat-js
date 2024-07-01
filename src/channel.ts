import * as Ably from 'ably';

import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

export const getChannel = (name: string, realtime: Ably.Realtime): Ably.RealtimeChannel => {
  return realtime.channels.get(name, DEFAULT_CHANNEL_OPTIONS);
};
