import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TypingSetEvent } from '../../../src/core/events.ts';
import { RoomStatus } from '../../../src/core/room-status.ts';
import { TypingListener } from '../../../src/core/typing.ts';
import { useTyping } from '../../../src/react/hooks/use-typing.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { waitForArrayLength } from '../../helper/common.ts';
import { randomRoomName } from '../../helper/identifier.ts';

describe('useTyping', () => {
  afterEach(() => {
    cleanup();
  });

  it('should send typing events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can listen for typing events
    const roomName = randomRoomName();
    const roomTwo = await chatClientTwo.rooms.get(roomName);
    await roomTwo.attach();

    // start listening for typing events on room two
    const typingEventsRoomTwo: TypingSetEvent[] = [];
    roomTwo.typing.subscribe((typingEvent) => typingEventsRoomTwo.push(typingEvent));

    const TestComponent = () => {
      const { keystroke, stop, roomStatus } = useTyping();

      useEffect(() => {
        if (roomStatus !== RoomStatus.Attached) return;
        void keystroke().then(() => {
          setTimeout(() => {
            void stop();
          }, 500);
        });
      }, [keystroke, stop, roomStatus]);

      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider name={roomName}>
          <TestComponent />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    // expect the hook to send a start, followed by a stop typing event
    await waitForArrayLength(typingEventsRoomTwo, 2);
    expect(typingEventsRoomTwo[0]?.currentlyTyping).toStrictEqual(new Set([chatClientOne.clientId]));
    expect(typingEventsRoomTwo[1]?.currentlyTyping).toStrictEqual(new Set());
  }, 10000);
  it('should subscribe and correctly listen for typing events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can send typing events
    const roomName = randomRoomName();
    const roomTwo = await chatClientTwo.rooms.get(roomName);
    await roomTwo.attach();

    // store the received typing events for room one
    const typingEventsRoomOne: TypingSetEvent[] = [];

    // store the currently typing state from the hook
    let currentlyTypingSet = new Set<string>();
    let currentRoomStatus: RoomStatus | undefined;
    const TestComponent = ({ listener }: { listener: TypingListener }) => {
      // subscribe to typing events received by the test component
      const { currentlyTyping, roomStatus } = useTyping({ listener: listener });

      currentlyTypingSet = currentlyTyping;
      currentRoomStatus = roomStatus;

      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider name={roomName}>
          <TestComponent
            listener={(typingEvent) => {
              typingEventsRoomOne.push(typingEvent);
            }}
          />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    // ensure we are attached first
    await waitFor(
      () => {
        expect(currentRoomStatus).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );

    // send a typing started event from the second room
    await roomTwo.typing.keystroke();

    // expect a typing started event from the second room to be received by the test component
    await waitForArrayLength(typingEventsRoomOne, 1);
    expect(typingEventsRoomOne[0]?.currentlyTyping).toStrictEqual(new Set([chatClientTwo.clientId]));

    await waitFor(
      () => {
        expect(currentlyTypingSet).toStrictEqual(new Set([chatClientTwo.clientId]));
      },
      { timeout: 5000 },
    );

    // expect a typing stopped event from the second room to be received by the test component
    await roomTwo.typing.stop();
    await waitForArrayLength(typingEventsRoomOne, 2);
    expect(typingEventsRoomOne[1]?.currentlyTyping).toStrictEqual(new Set());

    // ensure the currently typing set is updated
    expect(currentlyTypingSet).toStrictEqual(new Set());
  }, 10000);
});
