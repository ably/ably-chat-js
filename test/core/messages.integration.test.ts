import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { ChatMessageAction, ChatMessageEventType } from '../../src/core/events.ts';
import { Message } from '../../src/core/message.ts';
import { OrderBy } from '../../src/core/messages.ts';
import { RealtimeChannelWithOptions } from '../../src/core/realtime-extensions.ts';
import { CHANNEL_OPTIONS_AGENT_STRING } from '../../src/core/version.ts';
import { newChatClient, waitForClientId } from '../helper/chat.ts';
import { waitForArrayLength } from '../helper/common.ts';
import { randomRoomName } from '../helper/identifier.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { getRandomRoom } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

describe('messages integration', { timeout: 10000 }, () => {
  beforeEach<TestContext>(async (context) => {
    context.chat = newChatClient();
    await waitForClientId(context.chat);
  });

  describe('channel configuration', () => {
    it<TestContext>('sets the agent version on the channel', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);
      const channel = room.channel as RealtimeChannelWithOptions;

      expect(channel.channelOptions.params).toEqual(expect.objectContaining({ agent: CHANNEL_OPTIONS_AGENT_STRING }));
    });
  });

  describe('send and receive', () => {
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
      await waitForArrayLength(messages, 2);

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
      await waitForArrayLength(messages, 2);

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

      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history = await room.messages.history({ limit: 2, orderBy: OrderBy.OldestFirst });

      expect(history.items.length).toEqual(2);
      expect(history.items, 'history messages to match').toEqual([
        expect.objectContaining(expectedMessages[0]),
        expect.objectContaining(expectedMessages[1]),
      ]);
    });
  });

  describe('delete', () => {
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
          case ChatMessageEventType.Created: {
            messages.push(messageEvent.message);
            break;
          }
          case ChatMessageEventType.Deleted: {
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
      const deletedMessage1 = await room.messages.delete(message1.serial, {
        description: 'Deleted message',
        metadata: { key: 'value' },
      });

      // deleted message should look like a deleted message
      expect(deletedMessage1.action).toEqual(ChatMessageAction.MessageDelete);
      expect(deletedMessage1.version).not.toEqual(deletedMessage1.serial);
      expect(deletedMessage1.version).not.toEqual(message1.version);
      expect(deletedMessage1.version.clientId).toEqual(chat.clientId);
      expect(deletedMessage1.version.description).toEqual('Deleted message');
      expect(deletedMessage1.version.metadata).toEqual({ key: 'value' });

      // Wait up to 5 seconds for the promises to resolve
      await waitForArrayLength(messages, 1);
      await waitForArrayLength(deletions, 1);

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
          text: '', // Delete messages have empty text
          clientId: chat.clientId,
          serial: deletedMessage1.serial,
          timestamp: deletedMessage1.timestamp,
          action: ChatMessageAction.MessageDelete,
          version: deletedMessage1.version,
        }),
      ]);
    });

    it<TestContext>('should be able to delete a message using just the serial string', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Attach the room
      await room.attach();

      // Subscribe to messages and filter them when they arrive
      const messages: Message[] = [];
      const deletions: Message[] = [];
      room.messages.subscribe((messageEvent) => {
        switch (messageEvent.type) {
          case ChatMessageEventType.Created: {
            messages.push(messageEvent.message);
            break;
          }
          case ChatMessageEventType.Deleted: {
            deletions.push(messageEvent.message);
            break;
          }
          default: {
            throw new Error('Unexpected message event type');
          }
        }
      });

      // send a message, and then delete it using just the serial
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const deletedMessage1 = await room.messages.delete(message1.serial, {
        description: 'Deleted message',
        metadata: { key: 'value' },
      });

      // Wait up to 5 seconds for the promises to resolve
      await waitForArrayLength(messages, 1);
      await waitForArrayLength(deletions, 1);

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
          text: '', // Delete messages have empty text
          clientId: chat.clientId,
          serial: deletedMessage1.serial,
          timestamp: deletedMessage1.timestamp,
          action: ChatMessageAction.MessageDelete,
          version: deletedMessage1.version,
        }),
      ]);

      expect(deletions[0]?.version.clientId).toEqual(chat.clientId);
    });

    it<TestContext>('should be able to delete a message using an object with serial', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Attach the room
      await room.attach();

      // Subscribe to messages and filter them when they arrive
      const messages: Message[] = [];
      const deletions: Message[] = [];
      room.messages.subscribe((messageEvent) => {
        switch (messageEvent.type) {
          case ChatMessageEventType.Created: {
            messages.push(messageEvent.message);
            break;
          }
          case ChatMessageEventType.Deleted: {
            deletions.push(messageEvent.message);
            break;
          }
          default: {
            throw new Error('Unexpected message event type');
          }
        }
      });

      // send a message, and then delete it using an object with serial
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const deletedMessage1 = await room.messages.delete(message1.serial, {
        description: 'Deleted message',
        metadata: { key: 'value' },
      });

      // Wait up to 5 seconds for the promises to resolve
      await waitForArrayLength(messages, 1);
      await waitForArrayLength(deletions, 1);

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
          text: '', // Delete messages have empty text
          clientId: chat.clientId,
          serial: deletedMessage1.serial,
          timestamp: deletedMessage1.timestamp,
          action: ChatMessageAction.MessageDelete,
          version: deletedMessage1.version,
        }),
      ]);

      expect(deletions[0]?.version.clientId).toEqual(chat.clientId);
    });

    it<TestContext>('should be able to delete a message using with()', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      const message1 = await room.messages.send({ text: 'Hello there!' });
      const deletedMessage1 = await room.messages.delete(message1.serial, { description: 'Deleted message' });

      const updatedMessage1 = message1.with(deletedMessage1);

      expect(updatedMessage1).toEqual(
        expect.objectContaining({
          text: '', // Delete messages have empty text
          headers: {},
          metadata: {},
          clientId: chat.clientId,
          serial: message1.serial,
          version: deletedMessage1.version,
        }),
      );
    });
  });

  describe('update', () => {
    it<TestContext>('should be able to update and receive update messages', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Attach the room
      await room.attach();

      // Subscribe to messages and filter them when they arrive
      const messages: Message[] = [];
      const updates: Message[] = [];
      room.messages.subscribe((messageEvent) => {
        switch (messageEvent.type) {
          case ChatMessageEventType.Created: {
            messages.push(messageEvent.message);
            break;
          }
          case ChatMessageEventType.Updated: {
            updates.push(messageEvent.message);
            break;
          }
          default: {
            throw new Error('Unexpected message event type');
          }
        }
      });

      // send a message, and then update it
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const updated1 = await room.messages.update(message1.serial, message1.copy({ text: 'bananas' }), {
        description: 'updated message',
        metadata: { key: 'value' },
      });

      expect(updated1.text).toBe('bananas');
      expect(updated1.serial).toBe(message1.serial);
      expect(updated1.timestamp.getTime()).toBe(message1.timestamp.getTime());
      expect(updated1.version.clientId).toBe(chat.clientId);
      expect(updated1.version.description).toEqual('updated message');
      expect(updated1.version.metadata).toEqual({ key: 'value' });

      // Wait up to 5 seconds for the promises to resolve
      await waitForArrayLength(messages, 1);
      await waitForArrayLength(updates, 1);

      // Check that the message was received
      expect(messages).toEqual([
        expect.objectContaining({
          text: 'Hello there!',
          clientId: chat.clientId,
          serial: message1.serial,
        }),
      ]);

      // Check that the update was received
      expect(updates).toEqual([
        expect.objectContaining({
          text: 'bananas',
          clientId: chat.clientId,
          serial: message1.serial,
          action: ChatMessageAction.MessageUpdate,
          version: updated1.version,
          timestamp: message1.timestamp,
        }),
      ]);
    });

    it<TestContext>('should be able to update a message using just the serial string', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Attach the room
      await room.attach();

      // Subscribe to messages and filter them when they arrive
      const messages: Message[] = [];
      const updates: Message[] = [];
      room.messages.subscribe((messageEvent) => {
        switch (messageEvent.type) {
          case ChatMessageEventType.Created: {
            messages.push(messageEvent.message);
            break;
          }
          case ChatMessageEventType.Updated: {
            updates.push(messageEvent.message);
            break;
          }
          default: {
            throw new Error('Unexpected message event type');
          }
        }
      });

      // send a message, and then update it using just the serial
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const updated1 = await room.messages.update(message1.serial, {
        text: 'bananas',
        metadata: { key: 'value' },
      });

      // Wait up to 5 seconds for the promises to resolve
      await waitForArrayLength(messages, 1);
      await waitForArrayLength(updates, 1);

      // Check that the message was received
      expect(messages).toEqual([
        expect.objectContaining({
          text: 'Hello there!',
          clientId: chat.clientId,
          serial: message1.serial,
        }),
      ]);

      // Check that the update was received
      expect(updates).toEqual([
        expect.objectContaining({
          text: 'bananas',
          clientId: chat.clientId,
          serial: message1.serial,
          action: ChatMessageAction.MessageUpdate,
          version: updated1.version,
          timestamp: message1.timestamp,
        }),
      ]);
    });

    it<TestContext>('should be able to update a message using an object with serial', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Attach the room
      await room.attach();

      // Subscribe to messages and filter them when they arrive
      const messages: Message[] = [];
      const updates: Message[] = [];
      room.messages.subscribe((messageEvent) => {
        switch (messageEvent.type) {
          case ChatMessageEventType.Created: {
            messages.push(messageEvent.message);
            break;
          }
          case ChatMessageEventType.Updated: {
            updates.push(messageEvent.message);
            break;
          }
          default: {
            throw new Error('Unexpected message event type');
          }
        }
      });

      // send a message, and then update it using an object with serial
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const updated1 = await room.messages.update(message1.serial, {
        text: 'bananas',
        metadata: { key: 'value' },
      });

      // Wait up to 5 seconds for the promises to resolve
      await waitForArrayLength(messages, 1);
      await waitForArrayLength(updates, 1);

      // Check that the message was received
      expect(messages).toEqual([
        expect.objectContaining({
          text: 'Hello there!',
          clientId: chat.clientId,
          serial: message1.serial,
        }),
      ]);

      // Check that the update was received
      expect(updates).toEqual([
        expect.objectContaining({
          text: 'bananas',
          clientId: chat.clientId,
          serial: message1.serial,
          action: ChatMessageAction.MessageUpdate,
          version: updated1.version,
          timestamp: message1.timestamp,
        }),
      ]);
    });

    it<TestContext>('should be able to update message with serial and then with()', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Send initial message
      const message1 = await room.messages.send({ text: 'Hello there!' });

      // Update using serial
      const updated1 = await room.messages.update(message1.serial, {
        text: 'bananas',
        metadata: { key: 'value' },
      });

      // Use with() to update the message
      const updated2 = message1.with(updated1);

      // Check that the final update was applied
      expect(updated2).toEqual(
        expect.objectContaining({
          text: 'bananas',
          clientId: chat.clientId,
          serial: message1.serial,
          action: ChatMessageAction.MessageUpdate,
          version: updated1.version,
          timestamp: message1.timestamp,
          metadata: { key: 'value' },
        }),
      );
    });
  });

  describe('history', () => {
    it<TestContext>('should be able to retrieve chat history', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Publish 3 messages
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const message2 = await room.messages.send({ text: 'I have the high ground!' });
      const message3 = await room.messages.send({ text: 'You underestimate my power!' });

      // Do a history request to get all 3 messages
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history = await room.messages.history({ limit: 3, orderBy: OrderBy.OldestFirst });

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

    it<TestContext>('should be able to retrieve chat deletion in history', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Publish 1 messages
      const message1 = await room.messages.send({ text: 'Hello there!' });

      // Delete the message
      const deletedMessage1 = await room.messages.delete(message1.serial, { description: 'Deleted message' });

      // Do a history request to get the deleted message
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history = await room.messages.history({ limit: 3, orderBy: OrderBy.OldestFirst });

      expect(history.items).toEqual([
        expect.objectContaining({
          text: '', // Delete messages have empty text
          headers: {},
          metadata: {},
          clientId: chat.clientId,
          serial: deletedMessage1.serial,
          timestamp: message1.timestamp,
          version: {
            serial: deletedMessage1.version.serial,
            timestamp: deletedMessage1.version.timestamp,
            clientId: deletedMessage1.version.clientId,
            description: 'Deleted message',
            metadata: deletedMessage1.version.metadata,
          },
          action: ChatMessageAction.MessageDelete,
        }),
      ]);

      // test shorthand getters
      expect(history.items[0]?.version.serial).toEqual(deletedMessage1.version.serial);
      expect(history.items[0]?.version.timestamp).toEqual(deletedMessage1.version.timestamp);
      expect(history.items[0]?.version.clientId).toEqual(chat.clientId);
      expect(history.items[0]?.version.description).toEqual('Deleted message');

      // We shouldn't have a "next" link in the response
      expect(history.hasNext()).toBe(false);
    });

    it<TestContext>('should be able to retrieve updated chat message in history', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Publish 1 messages
      const message1 = await room.messages.send({ text: 'Hello there!' });

      // Update the message
      const updatedMessage1 = await room.messages.update(message1.serial, message1.copy({ text: 'Hello test!' }), {
        description: 'updated message',
      });

      // Do a history request to get the update message
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history = await room.messages.history({ limit: 3, orderBy: OrderBy.OldestFirst });

      expect(history.items).toEqual([
        expect.objectContaining({
          text: 'Hello test!',
          clientId: chat.clientId,
          serial: updatedMessage1.serial,
          timestamp: message1.timestamp,
          version: {
            serial: updatedMessage1.version.serial,
            timestamp: updatedMessage1.version.timestamp,
            clientId: updatedMessage1.version.clientId,
            description: updatedMessage1.version.description,
          },
          action: ChatMessageAction.MessageUpdate,
        }),
      ]);

      // We shouldn't have a "next" link in the response
      expect(history.hasNext()).toBe(false);
    });
  });

  describe('pagination', () => {
    it<TestContext>('should be able to paginate chat history', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Publish 4 messages
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const message2 = await room.messages.send({ text: 'I have the high ground!' });
      const message3 = await room.messages.send({ text: 'You underestimate my power!' });
      const message4 = await room.messages.send({ text: "Don't try it!" });

      // Do a history request to get the first 3 messages
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history1 = await room.messages.history({ limit: 3, orderBy: OrderBy.OldestFirst });

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

      const history1Item = history1.items[0];
      const history2Item = history2?.items[0];

      if (!history1Item) expect.fail('expected history1Item to be defined');
      if (!history2Item) expect.fail('expected history2Item to be defined');

      // Ensure that items in `next` pagination can call `Message` functions
      expect(history1Item.serial < history2Item.serial).toBeTruthy();

      // Ensure that `current` pagination method works
      const current = await history2.current();
      expect(current.items).toEqual([
        expect.objectContaining({
          text: "Don't try it!",
          clientId: chat.clientId,
          serial: message4.serial,
        }),
      ]);

      const currentItem = current.items[0];

      if (!currentItem) {
        expect.fail('expected currentItem to be defined');
      }
      // Ensure the items in the `current` pagination can call `Message` functions
      expect(currentItem.serial === history2Item.serial).toBeTruthy();

      // Ensure that `first` pagination method works
      const first = await history2.first();
      expect(first.items).toEqual([
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

      const firstItem = first.items[0];
      if (!firstItem) {
        expect.fail('expected firstItem to be defined');
      }
      // Ensure the items in the `first` pagination can call `Message` functions
      expect(firstItem.serial).toEqual(history1Item.serial);

      // We shouldn't have a "next" link in the response
      expect(history2.hasNext()).toBe(false);
    });

    it<TestContext>('should be able to paginate chat history (msgpack)', async () => {
      const chat = newChatClient(undefined, ablyRealtimeClient({ useBinaryProtocol: true }));

      const room = await getRandomRoom(chat);

      // Publish 4 messages
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const message2 = await room.messages.send({ text: 'I have the high ground!' });
      const message3 = await room.messages.send({ text: 'You underestimate my power!' });
      const message4 = await room.messages.send({ text: "Don't try it!" });

      // Do a history request to get the first 3 messages
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history1 = await room.messages.history({ limit: 3, orderBy: OrderBy.OldestFirst });

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
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const history1 = await room.messages.history({ limit: 3, orderBy: OrderBy.NewestFirst });

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
  });

  describe('subscription and history before subscribe', () => {
    it<TestContext>('should be able to get history for listener from attached serial', async (context) => {
      const { chat } = context;

      const room = await getRandomRoom(chat);

      // Publish some messages
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const message2 = await room.messages.send({ text: 'I have the high ground!' });

      // Subscribe to messages and add them to a list when they arrive
      const messages: Message[] = [];
      const { historyBeforeSubscribe } = room.messages.subscribe((messageEvent) => {
        messages.push(messageEvent.message);
      });

      await room.attach();

      // Do a history request to get the messages before up
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const historyPreSubscription1 = await historyBeforeSubscribe({ limit: 50 });

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
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
      const historyPreSubscription2 = await historyBeforeSubscribe({ limit: 50 });

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
      const { historyBeforeSubscribe } = room.messages.subscribe(() => {});

      // Attach the room
      await room.attach();

      // Publish some messages
      const message1 = await room.messages.send({ text: 'Hello there!' });
      const message2 = await room.messages.send({ text: 'I have the high ground!' });

      // Do a history request which should use attach serial
      const historyPreSubscription1 = await historyBeforeSubscribe({ limit: 50 });

      // Should have no items since we are using attach serial
      expect(historyPreSubscription1.items).toEqual([]);

      const { historyBeforeSubscribe: historyBeforeSubscribeListener2 } = room.messages.subscribe(() => {});

      // Check we see the latest messages
      await new Promise((resolve) => setTimeout(resolve, 3000)); // TODO wait for persistence - this will not be necessary in the future
      const historyPreSubscription2 = await historyBeforeSubscribeListener2({ limit: 50 });

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

      const { historyBeforeSubscribe } = room.messages.subscribe(() => {});
      const { historyBeforeSubscribe: historyBeforeSubscribe2 } = room.messages.subscribe(() => {});
      const { historyBeforeSubscribe: historyBeforeSubscribe3 } = room.messages.subscribe(() => {});

      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future

      // Do a history request to get the messages before up
      const historyPreSubscription1 = await historyBeforeSubscribe({ limit: 50 });
      const historyPreSubscription2 = await historyBeforeSubscribe2({ limit: 50 });
      const historyPreSubscription3 = await historyBeforeSubscribe3({ limit: 50 });

      // Expect all listeners to have the same history
      expect(historyPreSubscription1.items).toEqual(historyPreSubscription2.items);
      expect(historyPreSubscription2.items).toEqual(historyPreSubscription3.items);
    });

    it<TestContext>('handles the room being released before historyBeforeSubscribe is called', async (context) => {
      const chat = context.chat;
      const roomName = randomRoomName();
      const room = await chat.rooms.get(roomName);

      // Create a subscription to messages
      room.messages.subscribe(() => {});

      // Now release the room
      // We should not have any unhanded promise rejections
      // Note that an unhandled rejection will not cause the test to fail, but it will cause the process to exit
      // with a non-zero exit code.
      await chat.rooms.release(roomName);
    });
  });
});
