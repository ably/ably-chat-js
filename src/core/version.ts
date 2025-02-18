import * as Ably from 'ably';

// Update this when you release a new version
export const VERSION = '0.4.0';
export const CHANNEL_OPTIONS_AGENT_STRING = `chat-js/${VERSION}`;
export const CHANNEL_OPTIONS_AGENT_STRING_REACT = `chat-react/${VERSION}`;
export const DEFAULT_CHANNEL_OPTIONS: Ably.ChannelOptions = {
  params: { agent: CHANNEL_OPTIONS_AGENT_STRING },
  attachOnSubscribe: false,
};
export const DEFAULT_CHANNEL_OPTIONS_REACT: Ably.ChannelOptions = {
  params: { agent: CHANNEL_OPTIONS_AGENT_STRING_REACT },
  attachOnSubscribe: false,
};
