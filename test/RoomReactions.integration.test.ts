import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../src/Chat.ts';
import { Reaction } from '../src/Reaction.ts';
import { RealtimeChannelWithOptions } from '../src/realtimeextensions.ts';
import { RoomStatus } from '../src/RoomStatus.ts';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../src/version.ts';
import { newChatClient } from './helper/chat.ts';
import { randomRoomId } from './helper/identifier.ts';
import { waitForRoomStatus } from './helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

const waitForReactions = (foundTypes: string[], expectedTypes: string[]) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (foundTypes.length === expectedTypes.length) {
        clearInterval(interval);
        clearTimeout(timeout);

        foundTypes.forEach((foundType, idx) => {
          const expectedType = expectedTypes[idx];
          try {
            expect(foundType).toEqual(expectedType);
          } catch (err: unknown) {
            reject(err as Error);
            return;
          }
        });

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

  it<TestContext>('sets the agent version on the channel', (context) => {
    const { chat } = context;

    const roomName = Math.random().toString(36).substring(7);
    const room = chat.rooms.get(roomName);
    const channel = room.messages.channel as RealtimeChannelWithOptions;

    expect(channel.channelOptions.params).toEqual(expect.objectContaining({ agent: CHANNEL_OPTIONS_AGENT_STRING }));
  });

  it<TestContext>('sends and receives a reaction', async (context) => {
    const { chat } = context;

    const room = chat.rooms.get(randomRoomId());

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

    const room = chat.rooms.get(randomRoomId());

    // Attach the room
    await room.attach();

    // Subscribe discontinuity events
    const discontinuityErrors: (Ably.ErrorInfo | undefined)[] = [];
    const { off } = room.reactions.onDiscontinuity((error: Ably.ErrorInfo | undefined) => {
      discontinuityErrors.push(error);
    });

    const channelSuspendable = room.reactions.channel as Ably.RealtimeChannel & {
      notifyState(state: 'suspended'): void;
    };

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room.status, RoomStatus.Suspended);

    // Now attach the room again
    await room.attach();

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
