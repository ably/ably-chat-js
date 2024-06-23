import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../src/Chat.ts';
import { Message } from '../src/Message.ts';
import { RealtimeChannelWithOptions } from '../src/realtimeextensions.ts';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../src/version.ts';
import { newChatClient } from './helper/chat.ts';
import { waitForFeatureConnected, waitForFeatureFailed } from './helper/feature.ts';
import { randomRoomId } from './helper/identifier.ts';
import { ablyRealtimeClient } from './helper/realtimeClient.ts';

interface TestContext {
  chat: ChatClient;
}

const waitForMessages = (messages: Message[], expectedCount: number) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (messages.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for messages'));
    }, 3000);
  });
};

describe('messages integration', () => {
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
  });

  it<TestContext>('sets the agent version on the channel', async (context) => {
    const { chat } = context;

    const roomName = Math.random().toString(36).substring(7);
    const room = chat.rooms.get(roomName);
    const channel = room.messages.channel as RealtimeChannelWithOptions;

    expect(channel.channelOptions.params).toEqual({ agent: CHANNEL_OPTIONS_AGENT_STRING });
  });

  it<TestContext>('has a feature status', async () => {
    const realtime = ablyRealtimeClient();
    const chat = newChatClient(undefined, realtime);
    const room = chat.rooms.get(randomRoomId());
    await room.messages.subscribe(() => {});

    await waitForFeatureConnected(room.messages);

    // Change the token to force a reconnection and failure
    realtime.auth.authorize(undefined, { token: 'invalid' }).catch(() => {});

    await waitForFeatureFailed(room.messages);
  });

  it<TestContext>('should be able to send and receive chat messages', async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Subscribe to messages and add them to a list when they arive
    const messages: Message[] = [];
    await room.messages.subscribe((messageEvent) => {
      messages.push(messageEvent.message);
    });

    const message1 = await room.messages.send('Hello there!');
    const message2 = await room.messages.send('I have the high ground!');

    // Wait up to 5 seconds for the messagesPromise to resolve
    await waitForMessages(messages, 2);

    // Check that the messages were received
    expect(messages).toEqual([
      expect.objectContaining({
        content: 'Hello there!',
        clientId: chat.clientId,
        timeserial: message1.timeserial,
      }),
      expect.objectContaining({
        content: 'I have the high ground!',
        clientId: chat.clientId,
        timeserial: message2.timeserial,
      }),
    ]);
  });

  it<TestContext>('should be able to retrieve chat history', async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Publish 3 messages
    const message1 = await room.messages.send('Hello there!');
    const message2 = await room.messages.send('I have the high ground!');
    const message3 = await room.messages.send('You underestimate my power!');

    // Do a history request to get all 3 messages
    const history = await room.messages.query({ limit: 3, direction: 'forwards' });

    expect(history.items).toEqual([
      expect.objectContaining({
        content: 'Hello there!',
        clientId: chat.clientId,
        timeserial: message1.timeserial,
      }),
      expect.objectContaining({
        content: 'I have the high ground!',
        clientId: chat.clientId,
        timeserial: message2.timeserial,
      }),
      expect.objectContaining({
        content: 'You underestimate my power!',
        clientId: chat.clientId,
        timeserial: message3.timeserial,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history.hasNext()).toBe(false);
  });

  it<TestContext>('should be able to paginate chat history', async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Publish 4 messages
    const message1 = await room.messages.send('Hello there!');
    const message2 = await room.messages.send('I have the high ground!');
    const message3 = await room.messages.send('You underestimate my power!');
    const message4 = await room.messages.send("Don't try it!");

    // Do a history request to get the first 3 messages
    const history1 = await room.messages.query({ limit: 3, direction: 'forwards' });

    expect(history1.items).toEqual([
      expect.objectContaining({
        content: 'Hello there!',
        clientId: chat.clientId,
        timeserial: message1.timeserial,
      }),
      expect.objectContaining({
        content: 'I have the high ground!',
        clientId: chat.clientId,
        timeserial: message2.timeserial,
      }),
      expect.objectContaining({
        content: 'You underestimate my power!',
        clientId: chat.clientId,
        timeserial: message3.timeserial,
      }),
    ]);

    // We should have a "next" link in the response
    expect(history1.hasNext()).toBe(true);

    // Do a history request to get the next 2 messages
    const history2 = await history1.next();

    expect(history2!.items).toEqual([
      expect.objectContaining({
        content: "Don't try it!",
        clientId: chat.clientId,
        timeserial: message4.timeserial,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history2!.hasNext()).toBe(false);
  });

  it<TestContext>('should be able to paginate chat history, but backwards', async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    // Publish 4 messages
    const message1 = await room.messages.send('Hello there!');
    const message2 = await room.messages.send('I have the high ground!');
    const message3 = await room.messages.send('You underestimate my power!');
    const message4 = await room.messages.send("Don't try it!");

    // Do a history request to get the last 3 messages
    const history1 = await room.messages.query({ limit: 3, direction: 'backwards' });

    expect(history1.items).toEqual([
      expect.objectContaining({
        content: "Don't try it!",
        clientId: chat.clientId,
        timeserial: message4.timeserial,
      }),
      expect.objectContaining({
        content: 'You underestimate my power!',
        clientId: chat.clientId,
        timeserial: message3.timeserial,
      }),
      expect.objectContaining({
        content: 'I have the high ground!',
        clientId: chat.clientId,
        timeserial: message2.timeserial,
      }),
    ]);

    // We should have a "next" link in the response
    expect(history1.hasNext()).toBe(true);

    // Do a history request to get the next 2 messages
    const history2 = await history1.next();

    expect(history2!.items).toEqual([
      expect.objectContaining({
        content: 'Hello there!',
        clientId: chat.clientId,
        timeserial: message1.timeserial,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history2!.hasNext()).toBe(false);
  });
});
