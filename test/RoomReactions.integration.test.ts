import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../src/Chat.ts';
import { Reaction } from '../src/Reaction.ts';
import { RealtimeChannelWithOptions } from '../src/realtimeextensions.ts';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../src/version.ts';
import { newChatClient } from './helper/chat.ts';
import { randomRoomId } from './helper/identifier.ts';

interface TestContext {
  chat: ChatClient;
}

const waitForReactions = (foundTypes: string[], expectedTypes: string[]) => {
  return new Promise<void>((resolve, reject) => {
    let timeout;
    const interval = setInterval(() => {
      if (foundTypes.length === expectedTypes.length) {
        clearInterval(interval);
        if (timeout) {
          clearTimeout(timeout);
        }

        foundTypes.forEach((foundType, idx) => {
          const expectedType = expectedTypes[idx];
          try {
            expect(foundType).toEqual(expectedType);
          } catch (err) {
            reject(err);
            return;
          }
        });

        resolve();
      }
    }, 100);
    timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for reactions'));
    }, 3000);
  });
};

describe('room-level reactions integration test', () => {
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

  it<TestContext>('sends and receives a reaction', async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

    const expectedReactions = ['like', 'like', 'love', 'hate'];
    const reactions: string[] = [];

    const subscriber = (reaction: Reaction) => {
      reactions.push(reaction.type);
    };
    await room.reactions.subscribe(subscriber);

    for (let reactionType of expectedReactions) {
      await room.reactions.send(reactionType);
    }

    await waitForReactions(reactions, expectedReactions);
    await room.reactions.unsubscribe(subscriber);
  });
});
