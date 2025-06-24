import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.js';
import { RoomReactionEvent, RoomReactionEventType } from '../../src/core/events.js';
import { RealtimeChannelWithOptions } from '../../src/core/realtime-extensions.js';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../../src/core/version.js';
import { newChatClient } from '../helper/chat.js';
import { getRandomRoom } from '../helper/room.js';

interface TestContext {
  chat: ChatClient;
}

const waitForReactions = (foundTypes: string[], expectedTypes: string[]) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (foundTypes.length === expectedTypes.length) {
        clearInterval(interval);
        clearTimeout(timeout);

        for (const [idx, foundType] of foundTypes.entries()) {
          const expectedType = expectedTypes[idx];
          try {
            expect(foundType).toEqual(expectedType);
          } catch (error: unknown) {
            reject(error as Error);
            continue;
          }
        }

        resolve();
      }
    }, 100);
    const timeout = setTimeout(() => {
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

    const room = await getRandomRoom(chat);
    const channel = room.channel as RealtimeChannelWithOptions;

    expect(channel.channelOptions.params).toEqual(expect.objectContaining({ agent: CHANNEL_OPTIONS_AGENT_STRING }));
  });

  it<TestContext>('sends and receives a reaction', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    const expectedReactions = ['like', 'like', 'love', 'hate'];
    const reactions: string[] = [];

    room.reactions.subscribe((event: RoomReactionEvent) => {
      expect(event.type).toBe(RoomReactionEventType.Reaction);
      reactions.push(event.reaction.name);
    });

    // Attach the room
    await room.attach();

    // Send reactions
    for (const type of expectedReactions) {
      await room.reactions.send({ type });
    }

    await waitForReactions(reactions, expectedReactions);
  });
});
