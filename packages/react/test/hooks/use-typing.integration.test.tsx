import { cleanup, render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RoomOptionsDefaults } from '../../../src/core/room-options.ts';
import { RoomStatus } from '../../../src/core/room-status.ts';
import { TypingEvent, TypingListener } from '../../../src/core/typing.ts';
import { useTyping } from '../../../src/react/hooks/use-typing.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

function waitForTypingEvents(typingEvents: TypingEvent[], expectedCount: number) {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (typingEvents.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for typing events'));
    }, 5000);
  });
}

describe('useTyping', () => {
  afterEach(() => {
    cleanup();
  });

  it('should send typing events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can listen for typing events
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // start listening for typing events on room two
    const typingEventsRoomTwo: TypingEvent[] = [];
    roomTwo.typing.subscribe((typingEvent) => typingEventsRoomTwo.push(typingEvent));

    const TestComponent = () => {
      const { start, stop, roomStatus } = useTyping();

      useEffect(() => {
        if (roomStatus !== RoomStatus.Attached) return;
        void start().then(() => {
          setTimeout(() => {
            void stop();
          }, 500);
        });
      }, [start, stop, roomStatus]);

      return null;
    };

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

    // expect the hook to send a start, followed by a stop typing event
    await waitForTypingEvents(typingEventsRoomTwo, 2);
    expect(typingEventsRoomTwo[0]?.currentlyTyping).toStrictEqual(new Set([chatClientOne.clientId]));
    expect(typingEventsRoomTwo[1]?.currentlyTyping).toStrictEqual(new Set());
  }, 10000);
  it('should subscribe and correctly listen for typing events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can send typing events
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // store the received typing events for room one
    const typingEventsRoomOne: TypingEvent[] = [];

    // store the currently typing state from the hook
    let currentlyTypingSet = new Set<string>();

    const TestComponent = ({ listener }: { listener: TypingListener }) => {
      // subscribe to typing events received by the test component
      const { currentlyTyping } = useTyping({ listener: listener });

      currentlyTypingSet = currentlyTyping;

      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent listener={(typingEvent) => typingEventsRoomOne.push(typingEvent)} />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    // send a typing started event from the second room
    await roomTwo.typing.start();

    // expect a typing started event from the second room to be received by the test component
    await waitForTypingEvents(typingEventsRoomOne, 1);
    expect(typingEventsRoomOne[0]?.currentlyTyping).toStrictEqual(new Set([chatClientTwo.clientId]));

    // ensure the currently typing set is updated
    expect(currentlyTypingSet).toStrictEqual(new Set([chatClientTwo.clientId]));

    // expect a typing stopped event from the second room to be received by the test component
    await roomTwo.typing.stop();
    await waitForTypingEvents(typingEventsRoomOne, 2);
    expect(typingEventsRoomOne[1]?.currentlyTyping).toStrictEqual(new Set());

    // ensure the currently typing set is updated
    expect(currentlyTypingSet).toStrictEqual(new Set());
  }, 10000);
});
