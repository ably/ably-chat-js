import {
  ChatClient,
  ChatMessageActions,
  Message,
  MessageEvents,
  MessageListener,
  RoomOptionsDefaults,
  RoomStatus,
} from '@ably/chat';
import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    cleanup();
  });

  it('should send messages correctly', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can listen for messages
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // start listening for messages
    const messagesRoomTwo: Message[] = [];
    roomTwo.messages.subscribe((message) => messagesRoomTwo.push(message.message));

    const TestComponent = () => {
      const { send, roomStatus } = useMessages();

      useEffect(() => {
        if (roomStatus === RoomStatus.Attached) {
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

  it('should delete messages correctly', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room and attach it, so we can listen for deletions
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // start listening for deletions
    const deletionsRoomTwo: Message[] = [];
    roomTwo.messages.subscribe((message) => {
      if (message.type === MessageEvents.Deleted) {
        deletionsRoomTwo.push(message.message);
      }
    });

    const TestComponent = () => {
      const { send, deleteMessage, roomStatus } = useMessages();

      useEffect(() => {
        if (roomStatus === RoomStatus.Attached) {
          void send({ text: 'hello world' }).then((message) => {
            void deleteMessage(message, {
              description: 'deleted',
              metadata: { reason: 'test' },
            });
          });
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
    await waitForMessages(deletionsRoomTwo, 1);
    expect(deletionsRoomTwo[0]?.isDeleted).toBe(true);
    expect(deletionsRoomTwo[0]?.deletedBy).toBe(chatClientOne.clientId);
  }, 10000);

  it('should update messages correctly', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room and attach it, so we can listen for updates
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // start listening for updates
    const updatesRoomTwo: Message[] = [];
    roomTwo.messages.subscribe((message) => {
      if (message.type === MessageEvents.Updated) {
        updatesRoomTwo.push(message.message);
      }
    });

    const TestComponent = () => {
      const { send, update, roomStatus } = useMessages();

      useEffect(() => {
        if (roomStatus === RoomStatus.Attached) {
          void send({ text: 'hello world' }).then((message) => {
            void update(
              message,
              {
                text: 'hello universe',
                metadata: { icon: 'universe' },
                headers: { awesome: 'yes' },
              },
              {
                description: 'make it better',
                metadata: { something: 'else' },
              },
            );
          });
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
    await waitForMessages(updatesRoomTwo, 1);
    expect(updatesRoomTwo.length).toBe(1);
    const update = updatesRoomTwo[0];
    expect(update?.isUpdated).toBe(true);
    expect(update?.updatedBy).toBe(chatClientOne.clientId);
    expect(update?.text).toBe('hello universe');
    expect(update?.metadata).toEqual({ icon: 'universe' });
    expect(update?.latestAction).toBe(ChatMessageActions.MessageUpdate);
    expect(update?.latestActionDetails?.description).toBe('make it better');
    expect(update?.latestActionDetails?.metadata).toEqual({ something: 'else' });
  }, 10000);

  it('should receive messages on a subscribed listener', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room so we can send messages from it
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);

    // start listening for messages
    const messagesRoomOne: Message[] = [];

    let currentRoomStatus: RoomStatus;

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
        expect(currentRoomStatus).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );

    // send a message from the second room
    await roomTwo.messages.send({ text: 'hello world' });

    // expect a message to be received by the first room
    await waitForMessages(messagesRoomOne, 1);
    expect(messagesRoomOne[0]?.text).toBe('hello world');
  }, 10000);

  it('should receive previous messages for a subscribed listener', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room instance so we can send messages from it
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // send a few messages before the first room has subscribed
    await roomTwo.messages.send({ text: 'The force is strong with this one' });
    await roomTwo.messages.send({ text: 'I have the high ground' });
    await roomTwo.messages.send({ text: 'You underestimate my power' });

    let getPreviousMessagesRoomOne: ReturnType<typeof useMessages>['getPreviousMessages'];
    let roomStatusRoomOne: RoomStatus;

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
        expect(roomStatusRoomOne).toBe(RoomStatus.Attached);
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

  it('should reset getPreviousMessages if the listener becomes undefined then redefined', async () => {
    const chatClient = newChatClient();

    // create a second room instance so we can send messages from it
    const roomId = randomRoomId();
    const room = await chatClient.rooms.get(roomId, RoomOptionsDefaults);
    await room.attach();

    let lastSeenMessageText: string | undefined;
    room.messages.subscribe((message) => {
      lastSeenMessageText = message.message.text;
    });

    // send a few messages before the first room has subscribed
    await room.messages.send({ text: 'The force is strong with this one' });
    await room.messages.send({ text: 'I have the high ground' });
    await room.messages.send({ text: 'You underestimate my power' });

    // Wait til we see the message text
    await waitFor(
      () => {
        expect(lastSeenMessageText).toBe('You underestimate my power');
      },
      { timeout: 3000 },
    );

    let getPreviousMessages: ReturnType<typeof useMessages>['getPreviousMessages'] | undefined;

    const TestComponent = ({ defineListener }: { defineListener: boolean }) => {
      const { getPreviousMessages: previous } = useMessages({
        listener: defineListener ? () => {} : undefined,
      });

      getPreviousMessages = previous;

      return null;
    };

    const TestProvider = ({ defineListener }: { defineListener: boolean }) => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent defineListener={defineListener} />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    const { rerender } = render(<TestProvider defineListener={true} />);

    // Wait until the getPreviousMessages is defined
    await waitFor(
      () => {
        expect(getPreviousMessages).toBeDefined();
      },
      { timeout: 3000 },
    );

    // Do a get previous messages call
    if (!getPreviousMessages) {
      expect.fail('getPreviousMessages was not defined');
    }
    const results = await getPreviousMessages({ limit: 3 });

    // Check we get the expected messages
    expect(results.items.length).toBe(3);
    const messageTexts = results.items.map((item) => item.text);
    expect(messageTexts[0]).toBe('You underestimate my power');
    expect(messageTexts[1]).toBe('I have the high ground');
    expect(messageTexts[2]).toBe('The force is strong with this one');

    // Rerender the component with the listener undefined
    rerender(<TestProvider defineListener={false} />);

    // Wait until the getPreviousMessages is undefined
    await waitFor(
      () => {
        expect(getPreviousMessages).toBeUndefined();
      },
      { timeout: 3000 },
    );

    // Now, send two more messages
    await room.messages.send({ text: 'Tis but a scratch' });
    await room.messages.send({ text: 'Time is an illusion. Lunchtime doubly so.' });

    // Wait until we see the last message
    await waitFor(
      () => {
        expect(lastSeenMessageText).toBe('Time is an illusion. Lunchtime doubly so.');
      },
      { timeout: 3000 },
    );

    // Rerender the component with the listener defined
    rerender(<TestProvider defineListener={true} />);

    // Wait until the getPreviousMessages is defined
    await waitFor(
      () => {
        expect(getPreviousMessages).toBeDefined();
      },
      { timeout: 3000 },
    );

    // Check we get the expected messages
    const results2 = await getPreviousMessages({ limit: 3 });
    expect(results2.items.length).toBe(3);
    const messageTexts2 = results2.items.map((item) => item.text);
    expect(messageTexts2[0]).toBe('Time is an illusion. Lunchtime doubly so.');
    expect(messageTexts2[1]).toBe('Tis but a scratch');
    expect(messageTexts2[2]).toBe('You underestimate my power');

    // Send one more message
    await room.messages.send({ text: 'I am your father' });

    // Wait until we see the last message
    await waitFor(
      () => {
        expect(lastSeenMessageText).toBe('I am your father');
      },
      { timeout: 3000 },
    );

    // Do a get previous messages call, we should still get the same messages
    const results3 = await getPreviousMessages({ limit: 3 });
    expect(results3.items.length).toBe(3);
    const messageTexts3 = results3.items.map((item) => item.text);
    expect(messageTexts3[0]).toBe('Time is an illusion. Lunchtime doubly so.');
    expect(messageTexts3[1]).toBe('Tis but a scratch');
    expect(messageTexts3[2]).toBe('You underestimate my power');
  }, 20000);

  it('should persist the getPreviousMessages subscription point across renders, if listener remains defined', async () => {
    const chatClient = newChatClient();

    // create a second room instance so we can send messages from it
    const roomId = randomRoomId();
    const room = await chatClient.rooms.get(roomId, RoomOptionsDefaults);
    await room.attach();

    let lastSeenMessageText: string | undefined;
    room.messages.subscribe((message) => {
      lastSeenMessageText = message.message.text;
    });

    // send a few messages before the first room has subscribed
    await room.messages.send({ text: 'The force is strong with this one' });
    await room.messages.send({ text: 'I have the high ground' });
    await room.messages.send({ text: 'You underestimate my power' });

    // Wait til we see the message text
    await waitFor(
      () => {
        expect(lastSeenMessageText).toBe('You underestimate my power');
      },
      { timeout: 3000 },
    );

    let getPreviousMessages: ReturnType<typeof useMessages>['getPreviousMessages'] | undefined;

    const TestComponent = ({ listener }: { listener: MessageListener }) => {
      const { getPreviousMessages: previous } = useMessages({
        listener,
      });

      getPreviousMessages = previous;

      return null;
    };

    const TestProvider = ({ listener }: { listener: MessageListener }) => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent listener={listener} />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    const { rerender } = render(<TestProvider listener={vi.fn()} />);

    // Wait until the getPreviousMessages is defined
    await waitFor(
      () => {
        expect(getPreviousMessages).toBeDefined();
      },
      { timeout: 3000 },
    );

    // Do a get previous messages call
    if (!getPreviousMessages) {
      expect.fail('getPreviousMessages was not defined');
    }
    const results = await getPreviousMessages({ limit: 3 });

    // Check we get the expected messages
    expect(results.items.length).toBe(3);
    const messageTexts = results.items.map((item) => item.text);
    expect(messageTexts[0]).toBe('You underestimate my power');
    expect(messageTexts[1]).toBe('I have the high ground');
    expect(messageTexts[2]).toBe('The force is strong with this one');

    // Rerender the component with a new listener
    rerender(<TestProvider listener={vi.fn()} />);

    // Wait a few seconds to make sure the listener is redefined
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Now, send two more messages
    await room.messages.send({ text: 'Tis but a scratch' });
    await room.messages.send({ text: 'Time is an illusion. Lunchtime doubly so.' });

    // Wait 2 seconds to make sure all messages are received
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const results2 = await getPreviousMessages({ limit: 3 });

    // Check we get the expected messages
    expect(results.items.length).toBe(3);
    const messageTexts2 = results2.items.map((item) => item.text);
    expect(messageTexts2[0]).toBe('You underestimate my power');
    expect(messageTexts2[1]).toBe('I have the high ground');
    expect(messageTexts2[2]).toBe('The force is strong with this one');
  }, 20000);
});
