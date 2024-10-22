import { ChatMessageActions } from '@ably/chat';
import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { MessageEvents } from '../../src/core/events.ts';
import { Message } from '../../src/core/message.ts';
import { RealtimeChannelWithOptions } from '../../src/core/realtime-extensions.ts';
import { RoomOptionsDefaults } from '../../src/core/room-options.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../../src/core/version.ts';
import { newChatClient } from '../helper/chat.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { getRandomRoom, waitForRoomStatus } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

const waitForMessages = (messages: Message[], expectedCount: number) => {
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
    }, 3000);
  });
};

describe('messages integration', () => {
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
  });

  it<TestContext>('sets the agent version on the channel', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);
    const channel = room.messages.channel as RealtimeChannelWithOptions;

    expect(channel.channelOptions.params).toEqual(expect.objectContaining({ agent: CHANNEL_OPTIONS_AGENT_STRING }));
  });

  it<TestContext>('should be able to send and receive chat messages', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Subscribe to messages and add them to a list when they arrive
    const messages: Message[] = [];
    room.messages.subscribe((messageEvent) => {
      messages.push(messageEvent.message);
    });

    const message1 = await room.messages.send({ text: 'Hello there!' });
    const message2 = await room.messages.send({ text: 'I have the high ground!' });

    // Wait up to 5 seconds for the messagesPromise to resolve
    await waitForMessages(messages, 2);

    // Check that the messages were received
    expect(messages).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
    ]);
  });

  it<TestContext>('should be able to delete and receive deletion messages', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Subscribe to messages and filter them when they arrive
    const messages: Message[] = [];
    const deletions: Message[] = [];
    room.messages.subscribe((messageEvent) => {
      switch (messageEvent.type) {
        case MessageEvents.Created: {
          messages.push(messageEvent.message);
          break;
        }
        case MessageEvents.Deleted: {
          deletions.push(messageEvent.message);
          break;
        }
        default: {
          throw new Error('Unexpected message event type');
        }
      }
    });

    // send a message, and then delete it
    const message1 = await room.messages.send({ text: 'Hello there!' });
    const deletedMessage1 = await room.messages.delete(message1, {
      description: 'Deleted message',
      metadata: { key: 'value' },
    });

    // Wait up to 5 seconds for the promises to resolve
    await waitForMessages(messages, 1);
    await waitForMessages(deletions, 1);

    // Check that the message was received
    expect(messages).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
    ]);
    // Check that the deletion was received
    expect(deletions).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: deletedMessage1.serial,
        deletedAt: deletedMessage1.deletedAt,
        deletedBy: chat.clientId,
        latestAction: ChatMessageActions.MessageDelete,
        latestActionSerial: deletedMessage1.latestActionSerial,
      }),
    ]);
  });

  it<TestContext>('should be able to retrieve chat history', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Publish 3 messages
    const message1 = await room.messages.send({ text: 'Hello there!' });
    const message2 = await room.messages.send({ text: 'I have the high ground!' });
    const message3 = await room.messages.send({ text: 'You underestimate my power!' });

    // Do a history request to get all 3 messages
    const history = await room.messages.get({ limit: 3, direction: 'forwards' });

    expect(history.items).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
      expect.objectContaining({
        text: 'You underestimate my power!',
        clientId: chat.clientId,
        serial: message3.serial,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history.hasNext()).toBe(false);
  });

  // At the moment, the history API does not materialize deleted messages in the history.
  it.skip<TestContext>('should be able to retrieve chat deletion in history', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Publish 1 messages
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Delete the message
    const deletedMessage1 = await room.messages.delete(message1, { description: 'Deleted message' });

    // Do a history request to get the deleted message
    const history = await room.messages.get({ limit: 3, direction: 'forwards' });

    expect(history.items).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: deletedMessage1.serial,
        deletedAt: deletedMessage1.deletedAt,
        deletedBy: chat.clientId,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history.hasNext()).toBe(false);
  });

  it<TestContext>('should be able to paginate chat history', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Publish 4 messages
    const message1 = await room.messages.send({ text: 'Hello there!' });
    const message2 = await room.messages.send({ text: 'I have the high ground!' });
    const message3 = await room.messages.send({ text: 'You underestimate my power!' });
    const message4 = await room.messages.send({ text: "Don't try it!" });

    // Do a history request to get the first 3 messages
    const history1 = await room.messages.get({ limit: 3, direction: 'forwards' });

    expect(history1.items).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
      expect.objectContaining({
        text: 'You underestimate my power!',
        clientId: chat.clientId,
        serial: message3.serial,
      }),
    ]);

    // We should have a "next" link in the response
    expect(history1.hasNext()).toBe(true);

    // Do a history request to get the next 2 messages
    const history2 = await history1.next();

    expect(history2?.items).toEqual([
      expect.objectContaining({
        text: "Don't try it!",
        clientId: chat.clientId,
        serial: message4.serial,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history2?.hasNext()).toBe(false);
  });

  it<TestContext>('should be able to paginate chat history, but backwards', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Publish 4 messages
    const message1 = await room.messages.send({ text: 'Hello there!' });
    const message2 = await room.messages.send({ text: 'I have the high ground!' });
    const message3 = await room.messages.send({ text: 'You underestimate my power!' });
    const message4 = await room.messages.send({ text: "Don't try it!" });

    // Do a history request to get the last 3 messages
    const history1 = await room.messages.get({ limit: 3, direction: 'backwards' });

    expect(history1.items).toEqual([
      expect.objectContaining({
        text: "Don't try it!",
        clientId: chat.clientId,
        serial: message4.serial,
      }),
      expect.objectContaining({
        text: 'You underestimate my power!',
        clientId: chat.clientId,
        serial: message3.serial,
      }),
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
    ]);

    // We should have a "next" link in the response
    expect(history1.hasNext()).toBe(true);

    // Do a history request to get the next 2 messages
    const history2 = await history1.next();

    expect(history2?.items).toEqual([
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
    ]);

    // We shouldn't have a "next" link in the response
    expect(history2?.hasNext()).toBe(false);
  });

  it<TestContext>('should be able to send, receive and query chat messages with metadata and headers', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Subscribe to messages and add them to a list when they arrive
    const messages: Message[] = [];
    room.messages.subscribe((messageEvent) => {
      messages.push(messageEvent.message);
    });

    await room.attach();

    const message1 = await room.messages.send({
      text: 'Hello there!',
      headers: { key1: 'val1', key2: 22 },
      metadata: { hello: { name: 'world' } },
    });
    const message2 = await room.messages.send({
      text: 'I have the high ground!',
      headers: { key1: 'second key 1 value', key2: 99, greeting: 'yo' },
      metadata: { hello: { name: 'second' } },
    });

    // Wait up to 5 seconds for the messagesPromise to resolve
    await waitForMessages(messages, 2);

    const expectedMessages = [
      {
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
        headers: { key1: 'val1', key2: 22 },
        metadata: { hello: { name: 'world' } },
      },
      {
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
        headers: { key1: 'second key 1 value', key2: 99, greeting: 'yo' },
        metadata: { hello: { name: 'second' } },
      },
    ];

    // Check that the messages were received
    expect(messages, 'realtime messages to match').toEqual([
      expect.objectContaining(expectedMessages[0]),
      expect.objectContaining(expectedMessages[1]),
    ]);

    const history = await room.messages.get({ limit: 2, direction: 'forwards' });

    expect(history.items.length).toEqual(2);
    expect(history.items, 'history messages to match').toEqual([
      expect.objectContaining(expectedMessages[0]),
      expect.objectContaining(expectedMessages[1]),
    ]);
  });

  it<TestContext>('should be able to get history for listener from attached serial', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Publish some messages
    const message1 = await room.messages.send({ text: 'Hello there!' });
    const message2 = await room.messages.send({ text: 'I have the high ground!' });

    // Subscribe to messages and add them to a list when they arrive
    const messages: Message[] = [];
    const { getPreviousMessages } = room.messages.subscribe((messageEvent) => {
      messages.push(messageEvent.message);
    });

    await room.attach();

    // Do a history request to get the messages before up
    const historyPreSubscription1 = await getPreviousMessages({ limit: 50 });

    // Check the items in the history
    expect(historyPreSubscription1.items).toEqual([
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
    ]);

    // Send some more messages
    await room.messages.send({ text: 'You underestimate my power!' });
    await room.messages.send({ text: "Don't try it!" });

    // Try and get history again
    const historyPreSubscription2 = await getPreviousMessages({ limit: 50 });

    // It should not contain the new messages since we should be getting messages based on initial attach serial
    expect(historyPreSubscription2.items).toEqual([
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
    ]);
  });
  it<TestContext>('should be able to get history for listener with latest message serial', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Subscribe to messages, which will also set up the listener subscription point
    const { getPreviousMessages } = room.messages.subscribe(() => {});

    // Attach the room
    await room.attach();

    // Publish some messages
    const message1 = await room.messages.send({ text: 'Hello there!' });
    const message2 = await room.messages.send({ text: 'I have the high ground!' });

    // Do a history request which should use attach serial
    const historyPreSubscription1 = await getPreviousMessages({ limit: 50 });

    // Should have no items since we are using attach serial
    expect(historyPreSubscription1.items).toEqual([]);

    const { getPreviousMessages: getPreviousMessagesListener2 } = room.messages.subscribe(() => {});

    // Check we see the latest messages
    const historyPreSubscription2 = await getPreviousMessagesListener2({ limit: 50 });

    // Should have the latest messages
    expect(historyPreSubscription2.items).toEqual([
      expect.objectContaining({
        text: 'I have the high ground!',
        clientId: chat.clientId,
        serial: message2.serial,
      }),
      expect.objectContaining({
        text: 'Hello there!',
        clientId: chat.clientId,
        serial: message1.serial,
      }),
    ]);
  });

  it<TestContext>('should be able to get history for multiple listeners', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    await room.messages.send({ text: 'Hello there!' });
    await room.messages.send({ text: 'I have the high ground!' });
    await room.messages.send({ text: 'You underestimate my power!' });

    // Attach the room
    await room.attach();

    const { getPreviousMessages } = room.messages.subscribe(() => {});
    const { getPreviousMessages: getPreviousMessages2 } = room.messages.subscribe(() => {});
    const { getPreviousMessages: getPreviousMessages3 } = room.messages.subscribe(() => {});

    // Do a history request to get the messages before up
    const historyPreSubscription1 = await getPreviousMessages({ limit: 50 });
    const historyPreSubscription2 = await getPreviousMessages2({ limit: 50 });
    const historyPreSubscription3 = await getPreviousMessages3({ limit: 50 });

    // Expect all listeners to have the same history
    expect(historyPreSubscription1.items).toEqual(historyPreSubscription2.items);
    expect(historyPreSubscription2.items).toEqual(historyPreSubscription3.items);
  });

  it<TestContext>('handles discontinuities', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Subscribe discontinuity events
    const discontinuityErrors: (Ably.ErrorInfo | undefined)[] = [];
    const { off } = room.messages.onDiscontinuity((error: Ably.ErrorInfo | undefined) => {
      discontinuityErrors.push(error);
    });

    const channelSuspendable = room.messages.channel as Ably.RealtimeChannel & {
      notifyState(state: 'suspended' | 'attached'): void;
    };

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room, RoomStatus.Suspended);

    // Force the channel back into attached state - to simulate recovery
    channelSuspendable.notifyState('attached');

    // Wait for the room to go into attached
    await waitForRoomStatus(room, RoomStatus.Attached);

    // Wait for a discontinuity event to be received
    expect(discontinuityErrors.length).toBe(1);

    // Unsubscribe from discontinuity events
    off();

    // Simulate a discontinuity by forcing a channel into suspended state
    channelSuspendable.notifyState('suspended');

    // Wait for the room to go into suspended
    await waitForRoomStatus(room, RoomStatus.Suspended);

    // We shouldn't get any more discontinuity events
    expect(discontinuityErrors.length).toBe(1);

    // Calling off again should be a no-op
    off();
  });

  it<TestContext>('handles the room being released before getPreviousMessages is called', async (context) => {
    const chat = context.chat;
    const roomId = randomRoomId();
    const room = await chat.rooms.get(roomId, RoomOptionsDefaults);

    // Create a subscription to messages
    room.messages.subscribe(() => {});

    // Now release the room
    // We should not have any unhanded promise rejections
    // Note that an unhandled rejection will not cause the test to fail, but it will cause the process to exit
    // with a non-zero exit code.
    await chat.rooms.release(roomId);
  });
});
