import { ClientOptions } from 'ably';
import { describe, expect, it } from 'vitest';

import { ChatClient } from '../src/Chat.js';
import { RealtimeWithOptions } from '../src/realtimeextensions.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';

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
