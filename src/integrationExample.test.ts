import { beforeEach, describe, it, expect } from 'vitest';
import * as Ably from 'ably';
import { ablyRealtimeClient } from './helper/realtimeClient.ts';

interface TestContext {
  realtime: Ably.Realtime;
}

describe('example', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
  });

  describe('integration example', () => {
    it<TestContext>('should be able to send a realtime message and receive it', async (context) => {
      const { realtime } = context;
      const channel = realtime.channels.get('test-channel');
      const messagePromise = new Promise<Ably.Message>((resolve) => {
        channel.subscribe((message) => {
          resolve(message);
        });
      });
      const message = { name: 'test', data: 'message' };
      channel.publish('test', message);
      const receivedMessage = await messagePromise;
      expect(receivedMessage.data).toEqual(message);
      expect(receivedMessage.clientId).toEqual(realtime.auth.clientId);
    });
  });
});
