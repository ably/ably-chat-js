import { ChatClient, Message, RoomLifecycle, RoomOptionsDefaults } from '@ably/chat';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { useMessages } from '../../../src/react/hooks/use-messages.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

function waitForMessages(messages: Message[], expectedCount: number) {
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
    }, 5000);
  });
}

describe('useMessages', () => {
  it('should send messages correctly', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room and attach it, so we can listen for messages
    const roomId = randomRoomId();
    const roomTwo = chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // start listening for messages
    const messagesRoomTwo: Message[] = [];
    roomTwo.messages.subscribe((message) => messagesRoomTwo.push(message.message));

    const TestComponent = () => {
      const { send, roomStatus } = useMessages();

      useEffect(() => {
        if (roomStatus === RoomLifecycle.Attached) {
          void send({ text: 'hello world' });
        }
      }, [roomStatus]);

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

    // expect a message to be received by the second room
    await waitForMessages(messagesRoomTwo, 1);
    expect(messagesRoomTwo[0]?.text).toBe('hello world');
  }, 10000);

  it('should receive messages on a subscribed listener', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room so we can send messages from it
    const roomId = randomRoomId();
    const roomTwo = chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);

    // start listening for messages
    const messagesRoomOne: Message[] = [];

    let currentRoomStatus: RoomLifecycle;

    const TestComponent = () => {
      const { roomStatus } = useMessages({
        listener: (message) => messagesRoomOne.push(message.message),
      });

      useEffect(() => {
        currentRoomStatus = roomStatus;
      }, [roomStatus]);

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

    // wait for the first room to be attached
    await waitFor(
      () => {
        expect(currentRoomStatus).toBe(RoomLifecycle.Attached);
      },
      { timeout: 3000 },
    );

    // send a message from the second room
    await roomTwo.messages.send({ text: 'hello world' });

    // expect a message to be received by the first room
    await waitForMessages(messagesRoomOne, 1);
    expect(messagesRoomOne[0]?.text).toBe('hello world');
  }, 10000);

  it('should receive previous messages for a subscribed listener', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room instance so we can send messages from it
    const roomId = randomRoomId();
    const roomTwo = chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // send a few messages before the first room has subscribed
    await roomTwo.messages.send({ text: 'The force is strong with this one' });
    await roomTwo.messages.send({ text: 'I have the high ground' });
    await roomTwo.messages.send({ text: 'You underestimate my power' });

    let getPreviousMessagesRoomOne: ReturnType<typeof useMessages>['getPreviousMessages'];
    let roomStatusRoomOne: RoomLifecycle;

    const TestComponent = () => {
      const { getPreviousMessages, roomStatus } = useMessages({
        listener: () => {},
      });

      getPreviousMessagesRoomOne = getPreviousMessages;
      roomStatusRoomOne = roomStatus;

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

    // wait for the first room to be attached
    await waitFor(
      () => {
        expect(roomStatusRoomOne).toBe(RoomLifecycle.Attached);
      },
      { timeout: 3000 },
    );

    // send some more messages from the second room
    await roomTwo.messages.send({ text: 'Tis but a scratch' });
    await roomTwo.messages.send({ text: 'Time is an illusion. Lunchtime doubly so.' });

    if (!getPreviousMessagesRoomOne) {
      expect.fail('getPreviousMessages was not defined');
    }
    const results = await getPreviousMessagesRoomOne({ limit: 30 });

    expect(results.items.length).toBe(3);
    expect(results.items.find((item) => item.text === 'The force is strong with this one')).toBeDefined();
    expect(results.items.find((item) => item.text === 'I have the high ground')).toBeDefined();
    expect(results.items.find((item) => item.text === 'You underestimate my power')).toBeDefined();
  }, 10000);
});
