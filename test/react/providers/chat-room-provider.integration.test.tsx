import { cleanup, configure, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Message } from '../../../src/core/message.ts';
import { RoomStatus } from '../../../src/core/room-status.ts';
import { ChatMessageEvent } from '../../../src/index.ts';
import { useRoomStatus } from '../../../src/react/helper/use-room-status.ts';
import { useMessages } from '../../../src/react/hooks/use-messages.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomName } from '../../helper/identifier.ts';

describe('ChatRoomProvider', () => {
  beforeEach(() => {
    configure({ reactStrictMode: true });
  });

  afterEach(() => {
    configure({ reactStrictMode: false });
    cleanup();
  });

  // This check ensures that a chat room is valid when being used in strict mode
  it('should attach the room in strict mode', async () => {
    const chatClient = newChatClient();
    const TestComponent = () => <div />;
    const roomName = randomRoomName();

    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider name={roomName}>
          <TestComponent />
        </ChatRoomProvider>
      </ChatClientProvider>
    );
    render(<TestProvider />);

    const room = await chatClient.rooms.get(roomName);
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );
  });

  it('should release the room when the last reference is torn down', async () => {
    const chatClient = newChatClient();
    const roomName = randomRoomName();

    // Create a component that can be conditionally rendered
    const TestComponent = ({ show }: { show: boolean }) => {
      if (!show) return null;
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider name={roomName}>
            <div>Test Content</div>
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };

    // Render the component to create a room reference
    const { rerender } = render(<TestComponent show={true} />);

    // Wait for the room to be attached
    const room = await chatClient.rooms.get(roomName);
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );

    // Hide the component to trigger room release
    rerender(<TestComponent show={false} />);

    // Wait for the room to be released
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Released);
      },
      { timeout: 5000 },
    );
  });

  it('should keep room attached when one of multiple providers is hidden', async () => {
    const chatClient = newChatClient();
    const roomName = randomRoomName();

    // Component that can be conditionally rendered
    const TestComponent = ({ show1, show2 }: { show1: boolean; show2: boolean }) => (
      <ChatClientProvider client={chatClient}>
        {show1 && (
          <ChatRoomProvider name={roomName}>
            <div>Provider 1</div>
          </ChatRoomProvider>
        )}
        {show2 && (
          <ChatRoomProvider name={roomName}>
            <div>Provider 2</div>
          </ChatRoomProvider>
        )}
      </ChatClientProvider>
    );

    // Render both providers
    const { rerender } = render(
      <TestComponent
        show1={true}
        show2={true}
      />,
    );

    // Wait for the room to be attached
    const room = await chatClient.rooms.get(roomName);
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );

    // Hide the first provider
    rerender(
      <TestComponent
        show1={false}
        show2={true}
      />,
    );

    // Wait 3 seconds and assert room is still attached
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(room.status).toBe(RoomStatus.Attached);

    // Hide the second provider
    rerender(
      <TestComponent
        show1={false}
        show2={false}
      />,
    );

    // Wait for the room to be released
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Released);
      },
      { timeout: 5000 },
    );
  });

  it('should allow multiple providers for the same room to receive messages', async () => {
    const chatClient = newChatClient();
    const roomName = randomRoomName();
    const messages1: Message[] = [];
    const messages2: Message[] = [];

    // Component that subscribes to messages and writes to an array
    const MessageSubscriber = ({ messages }: { messages: Message[] }) => {
      useMessages({
        listener: (message: ChatMessageEvent) => {
          messages.push(message.message);
        },
      });

      return <div>Subscriber</div>;
    };

    // Render two separate provider trees for the same room in the same component tree
    const { unmount } = render(
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider name={roomName}>
          <MessageSubscriber messages={messages1} />
        </ChatRoomProvider>
        <ChatRoomProvider name={roomName}>
          <MessageSubscriber messages={messages2} />
        </ChatRoomProvider>
      </ChatClientProvider>,
    );

    // Wait for the room to be attached
    const room = await chatClient.rooms.get(roomName);
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );

    // Send a message using the ChatClient directly
    const testMessage = { text: 'Hello from test' };
    await room.messages.send(testMessage);

    // Wait for both subscribers to receive the message
    await vi.waitFor(
      () => {
        expect(messages1).toHaveLength(1);
        expect(messages2).toHaveLength(1);
        expect(messages1[0]).toMatchObject(testMessage);
        expect(messages2[0]).toMatchObject(testMessage);
      },
      { timeout: 5000 },
    );

    // Cleanup
    unmount();

    // Should be in released state
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Released);
      },
      { timeout: 5000 },
    );
  });

  it('should handle options changes', async () => {
    const chatClient = newChatClient();
    const roomName = randomRoomName();
    const initialOptions = { occupancy: { enableEvents: true } };
    const newOptions = { occupancy: { enableEvents: false } };

    const statusMap = new Map<number, RoomStatus>();
    const messagesMap = new Map<number, Message[]>();
    const messageSent = new Map<number, boolean>();

    // Component to monitor room status and subscribe to messages
    const RoomStatusMonitor = ({ id }: { id: number }) => {
      const { sendMessage } = useMessages({
        listener: (message: ChatMessageEvent) => {
          if (!messagesMap.has(id)) {
            messagesMap.set(id, []);
          }

          messagesMap.get(id)?.push(message.message);
        },
      });

      const { status } = useRoomStatus({
        onRoomStatusChange: (change) => {
          statusMap.set(id, change.current);

          // On the first render, where we're actually attached, send a message
          if (!messageSent.has(id) && change.current === RoomStatus.Attached) {
            messageSent.set(id, true);
            sendMessage({ text: `Hello from test ${id.toString()}` })
              .then(() => {
                console.log('Message sent');
              })
              .catch(() => {
                console.error('Failed to send message');
              });
          }
        },
      });

      return <div data-testid={`room-status-${id.toString()}`}>{status}</div>;
    };

    // Render with initial options
    const { rerender } = render(
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          name={roomName}
          options={initialOptions}
        >
          <RoomStatusMonitor id={1} />
        </ChatRoomProvider>
      </ChatClientProvider>,
    );

    // Verify the component shows attached status
    await vi.waitFor(
      () => {
        expect(statusMap.get(1)).toBe(RoomStatus.Attached);
      },
      { timeout: 2000 },
    );

    // Check that the message was received
    await vi.waitFor(
      () => {
        expect(messagesMap.get(1)?.length).toBe(1);
        expect(messagesMap.get(1)?.[0]).toMatchObject({ text: `Hello from test 1` });
      },
      { timeout: 2000 },
    );

    // Re-render with new options
    rerender(
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          name={roomName}
          options={newOptions}
        >
          <RoomStatusMonitor id={2} />
        </ChatRoomProvider>
      </ChatClientProvider>,
    );

    // Wait for new room to attach
    await vi.waitFor(
      () => {
        expect(statusMap.get(2)).toBe(RoomStatus.Attached);
      },
      { timeout: 2000 },
    );

    // Check that the message was received
    await vi.waitFor(
      () => {
        expect(messagesMap.get(2)?.length).toBe(1);
        expect(messagesMap.get(2)?.[0]).toMatchObject({ text: `Hello from test 2` });
      },
      { timeout: 2000 },
    );

    // For good measure, check that the first hook hasn't received any additional messages
    expect(messagesMap.get(1)?.length).toBe(1);

    // Check that the room options are the new options
    const room = await chatClient.rooms.get(roomName, newOptions);
    expect(room.options()).toMatchObject(newOptions);
  });
});
