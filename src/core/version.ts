import * as Ably from 'ably';

// Update this when you release a new version
export const VERSION = '0.4.0';
export const CHANNEL_OPTIONS_AGENT_STRING = `chat-js/${VERSION}`;
export const DEFAULT_CHANNEL_OPTIONS: Ably.ChannelOptions = {
  params: { agent: CHANNEL_OPTIONS_AGENT_STRING },
  attachOnSubscribe: false,
};
