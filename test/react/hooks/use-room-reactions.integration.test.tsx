import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Reaction } from '../../../src/core/reaction.ts';
import { AllFeaturesEnabled } from '../../../src/core/room-options.ts';
import { RoomReactionListener } from '../../../src/core/room-reactions.ts';
import { RoomStatus } from '../../../src/core/room-status.ts';
import { useRoomReactions } from '../../../src/react/hooks/use-room-reactions.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { waitForArrayLength } from '../../helper/common.ts';
import { randomRoomId } from '../../helper/identifier.ts';

describe('useRoomReactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('should send a room reaction', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can receive reactions
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, AllFeaturesEnabled);
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
          options={AllFeaturesEnabled}
        >
          <TestComponent />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    await waitForArrayLength(reactions, 1);

    // check the reaction was received
    expect(reactions.find((reaction) => reaction.type === 'like')).toBeTruthy();
  });

  it('should receive room reactions', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can send a reaction
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, AllFeaturesEnabled);
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
          options={AllFeaturesEnabled}
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
      { timeout: 5000 },
    );

    // send a reaction from the second room
    await roomTwo.reactions.send({ type: 'love' });

    await waitForArrayLength(reactions, 1);

    // check the reaction was received
    expect(reactions.find((reaction) => reaction.type === 'love')).toBeTruthy();
  });
});
