import { describe, it, expect } from 'vitest';
import { ChatClient } from '../src/Chat.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';
import { ClientOptions } from 'ably';
import { RealtimeWithOptions } from '../src/realtimeextensions.js';

interface OptionsWithAgent extends ClientOptions {
  agents?: Record<string, string | undefined>;
}

describe('Chat', () => {
  it('should set the agent string', () => {
    const options: OptionsWithAgent = {};
    const realtime = ablyRealtimeClient(options) as RealtimeWithOptions;
    /* eslint-disable-next-line */
    const chat = new ChatClient(realtime);

    expect(realtime.options.agents).toEqual({ chat: 'chat-js/0.0.1' });
  });
});
