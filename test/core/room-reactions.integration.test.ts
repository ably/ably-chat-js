import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { Reaction } from '../../src/core/reaction.ts';
import { RealtimeChannelWithOptions } from '../../src/core/realtime-extensions.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../../src/core/version.ts';
import { newChatClient } from '../helper/chat.ts';
import { getRandomRoom, waitForRoomStatus } from '../helper/room.ts';

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

    const room = getRandomRoom(chat);
    const channel = (await room.messages.channel) as RealtimeChannelWithOptions;

    expect(channel.channelOptions.params).toEqual(expect.objectContaining({ agent: CHANNEL_OPTIONS_AGENT_STRING }));
  });

  it<TestContext>('sends and receives a reaction', async (context) => {
    const { chat } = context;

    const room = getRandomRoom(chat);

    const expectedReactions = ['like', 'like', 'love', 'hate'];
    const reactions: string[] = [];

    room.reactions.subscribe((reaction: Reaction) => {
      reactions.push(reaction.type);
    });

    // Attach the room
    await room.attach();

    // Send reactions

    for (const type of expectedReactions) {
      await room.reactions.send({ type });
    }

    await waitForReactions(reactions, expectedReactions);
  });

  it<TestContext>('handles discontinuities', async (context) => {
    const { chat } = context;

    const room = getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Subscribe discontinuity events
    const discontinuityErrors: (Ably.ErrorInfo | undefined)[] = [];
    const { off } = room.reactions.onDiscontinuity((error: Ably.ErrorInfo | undefined) => {
      discontinuityErrors.push(error);
    });

    const channelSuspendable = (await room.reactions.channel) as Ably.RealtimeChannel & {
      notifyState(state: 'suspended' | 'attached'): void;
    };

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomStatus.Suspended);

    // Force the channel back into attached state - to simulate recovery
    channelSuspendable.notifyState('attached');

    // Wait for the room to go into attached
    await waitForRoomStatus(room.status, RoomStatus.Attached);

    // Wait for a discontinuity event to be received
    expect(discontinuityErrors.length).toBe(1);

    // Unsubscribe from discontinuity events
    off();

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomStatus.Suspended);

    // We shouldn't get any more discontinuity events
    expect(discontinuityErrors.length).toBe(1);

    // Calling off again should be a no-op
    off();
  });
});
