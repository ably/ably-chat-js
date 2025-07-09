import * as Ably from 'ably';

// Update this when you release a new version
export const VERSION = '0.10.0';
export const CHANNEL_OPTIONS_AGENT_STRING = `chat-js/${VERSION}`;
export const CHANNEL_OPTIONS_AGENT_STRING_REACT = `chat-react/${VERSION}`;
// Modes required for basic message functionality
export const DEFAULT_CHANNEL_MODES: Ably.ChannelMode[] = ['PUBLISH', 'SUBSCRIBE'];
export const DEFAULT_CHANNEL_OPTIONS: Ably.ChannelOptions = {
  params: { agent: CHANNEL_OPTIONS_AGENT_STRING },
  attachOnSubscribe: false,
  modes: DEFAULT_CHANNEL_MODES,
};

export const DEFAULT_CHANNEL_OPTIONS_REACT: Ably.ChannelOptions = {
  params: { agent: CHANNEL_OPTIONS_AGENT_STRING_REACT },
  attachOnSubscribe: false,
  modes: DEFAULT_CHANNEL_MODES,
};
