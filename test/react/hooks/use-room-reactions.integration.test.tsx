import { ChatClient, Reaction, RoomOptionsDefaults, RoomReactionListener, RoomStatus } from '@ably/chat';
import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRoomReactions } from '../../../src/react/hooks/use-room-reactions.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

function waitForReactions(reactions: Reaction[], expectedCount: number) {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (reactions.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for reactions'));
    }, 3000);
  });
}

describe('useRoomReactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('should send a room reaction', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room and attach it, so we can receive reactions
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // store the received reactions
    const reactions: Reaction[] = [];

    // subscribe to the reactions
    roomTwo.reactions.subscribe((reaction) => {
      reactions.push(reaction);
    });

    // the test component should send a reaction
    const TestComponent = () => {
      const { send, roomStatus } = useRoomReactions();

      // should send a reaction when mounted and the room is attached
      useEffect(() => {
        if (roomStatus !== RoomStatus.Attached) return;
        void send({ type: 'like' });
      }, [send, roomStatus]);

      return null;
    };

    // create the test providers and render it, sending a reaction
    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    await waitForReactions(reactions, 1);

    // check the reaction was received
    expect(reactions.find((reaction) => reaction.type === 'like')).toBeTruthy();
  });

  it('should receive room reactions', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room and attach it, so we can send a reaction
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // store the received reactions
    const reactions: Reaction[] = [];

    let currentRoomStatus: RoomStatus;

    // the test component should receive a reaction
    const TestComponent = ({ listener }: { listener: RoomReactionListener }) => {
      const { roomStatus } = useRoomReactions({ listener: listener });

      currentRoomStatus = roomStatus;

      return null;
    };

    // create the test providers and render it
    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent listener={(reaction) => reactions.push(reaction)} />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    // wait for the room to be attached
    chatClientOne.logger.info('got here');
    await waitFor(
      () => {
        expect(currentRoomStatus).toBe(RoomStatus.Attached);
      },
      { timeout: 3000 },
    );

    // send a reaction from the second room
    await roomTwo.reactions.send({ type: 'love' });

    await waitForReactions(reactions, 1);

    // check the reaction was received
    expect(reactions.find((reaction) => reaction.type === 'love')).toBeTruthy();
  });
});
