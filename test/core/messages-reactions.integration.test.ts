import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import {
  MessageReactionEventType,
  MessageReactionRawEvent,
  MessageReactionSummaryEvent,
  MessageReactionType,
} from '../../src/core/events.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForArrayLength } from '../helper/common.ts';
import { getRandomRoom } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

describe('message reactions integration', { timeout: 60000 }, () => {
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
  });

  it<TestContext>('should be able to send and receive raw message reactions', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat, { messages: { rawMessageReactions: true } });

    // Attach the room
    await room.attach();

    // Send a message
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to reactions and add them to a list when they arrive
    const found: MessageReactionRawEvent[] = [];
    room.messages.reactions.subscribeRaw((reactionEvent) => {
      found.push(reactionEvent);
    });

    await room.messages.reactions.add(message1, { type: MessageReactionType.Unique, name: '👍' });
    await room.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '🚀' });
    await room.messages.reactions.add(message1, { type: MessageReactionType.Multiple, name: '🙈', count: 10 });
    await room.messages.reactions.delete(message1, { type: MessageReactionType.Distinct, name: '🚀' });

    await waitForArrayLength(found, 4);

    expect(found[0]).toMatchObject({
      type: MessageReactionEventType.Create,
      reaction: {
        type: MessageReactionType.Unique,
        name: '👍',
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });

    expect(found[1]).toMatchObject({
      type: MessageReactionEventType.Create,
      reaction: {
        type: MessageReactionType.Distinct,
        name: '🚀',
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });

    expect(found[2]).toMatchObject({
      type: MessageReactionEventType.Create,
      reaction: {
        type: MessageReactionType.Multiple,
        name: '🙈',
        count: 10,
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });

    expect(found[3]).toMatchObject({
      type: MessageReactionEventType.Delete,
      reaction: {
        type: MessageReactionType.Distinct,
        name: '🚀',
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });
  });

  it<TestContext>('should be able to receive reaction summaries: multiple', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Send a message
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to reactions and add them to a list when they arrive
    const found: MessageReactionSummaryEvent[] = [];

    room.messages.reactions.subscribe((event) => {
      found.push(event);
    });

    // wait 1s
    // todo: reminder to remove this when no longer needed
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    await room.messages.reactions.add(message1, { type: MessageReactionType.Multiple, name: '👍' });
    await room.messages.reactions.add(message1, { type: MessageReactionType.Multiple, name: '👍', count: 10 });
    await room.messages.reactions.add(message1, { type: MessageReactionType.Multiple, name: '❤️', count: 3 });

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message1.serial,
            multiple: {
              '👍': {
                total: 11,
                clientIds: {
                  [chat.clientId]: 11,
                },
              },
              '❤️': {
                total: 3,
                clientIds: {
                  [chat.clientId]: 3,
                },
              },
            },
          },
        });
      },
      {
        timeout: 50_000,
        interval: 2000,
      },
    );

    await room.messages.reactions.delete(message1, { type: MessageReactionType.Multiple, name: '❤️' });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message1.serial,
            multiple: {
              '👍': {
                total: 11,
                clientIds: {
                  [chat.clientId]: 11,
                },
              },
            },
          },
        });
      },
      { timeout: 50_000 },
    );
  });

  it<TestContext>('should be able to receive reaction summaries: distinct', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Send a message
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to reactions and add them to a list when they arrive
    const found: MessageReactionSummaryEvent[] = [];

    room.messages.reactions.subscribe((event) => {
      found.push(event);
    });

    const client2 = newChatClient();
    const room2 = await client2.rooms.get(room.name);
    await room2.attach();

    const client3 = newChatClient();
    const room3 = await client3.rooms.get(room.name);
    await room3.attach();

    await Promise.all([
      room.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '👍' }),
      room.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '🥦' }),
      room2.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '👍' }),
      room2.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '❤️' }),
      room2.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '❤️' }),
      room3.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '🥥' }),
      room3.messages.reactions.add(message1, { type: MessageReactionType.Distinct, name: '🥥' }),
    ]);

    void room2.detach();
    void room3.detach();

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        latestSummary?.summary.distinct['👍']?.clientIds.sort();
        expect(latestSummary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message1.serial,
            distinct: {
              '👍': {
                total: 2,
                clientIds: [chat.clientId, client2.clientId].sort(),
              },
              '🥦': {
                total: 1,
                clientIds: [chat.clientId],
              },
              '❤️': {
                total: 1,
                clientIds: [client2.clientId],
              },
              '🥥': {
                total: 1,
                clientIds: [client3.clientId],
              },
            },
          },
        });
      },
      { timeout: 30_000 },
    );

    await room.messages.reactions.delete(message1, { type: MessageReactionType.Distinct, name: '👍' });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message1.serial,
            distinct: {
              '👍': {
                total: 1,
                clientIds: [client2.clientId],
              },
              '🥦': {
                total: 1,
                clientIds: [chat.clientId],
              },
              '❤️': {
                total: 1,
                clientIds: [client2.clientId],
              },
              '🥥': {
                total: 1,
                clientIds: [client3.clientId],
              },
            },
          },
        });
      },
      { timeout: 30_000 },
    );
  });

  it<TestContext>('should be able to receive reaction summaries: unique', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Send a message
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to reactions and add them to a list when they arrive
    const found: MessageReactionSummaryEvent[] = [];

    room.messages.reactions.subscribe((event) => {
      found.push(event);
    });

    const client2 = newChatClient();
    const room2 = await client2.rooms.get(room.name);
    await room2.attach();

    // First client reactions - only the last one (❤️) should remain
    await room.messages.reactions.add(message1, { type: MessageReactionType.Unique, name: '👍' });
    await room.messages.reactions.add(message1, { type: MessageReactionType.Unique, name: '🚀' });
    await room.messages.reactions.add(message1, { type: MessageReactionType.Unique, name: '❤️' });
    // Second client reactions - only the last one (👍) should remain
    await room2.messages.reactions.add(message1, { type: MessageReactionType.Unique, name: '🌟' });
    await room2.messages.reactions.add(message1, { type: MessageReactionType.Unique, name: '👍' });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message1.serial,
            unique: {
              '❤️': {
                total: 1,
                clientIds: [chat.clientId],
              },
              '👍': {
                total: 1,
                clientIds: [client2.clientId],
              },
            },
          },
        });
      },
      { timeout: 30_000 },
    );

    // Delete a reaction
    await room.messages.reactions.delete(message1, { type: MessageReactionType.Unique });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message1.serial,
            unique: {
              '👍': {
                total: 1,
                clientIds: [client2.clientId],
              },
            },
          },
        });
      },
      { timeout: 30_000 },
    );

    // Send another message and react with same emojis, make sure emojis are unique per-message
    const message2 = await room.messages.send({ text: 'Another message' });
    await Promise.all([
      room.messages.reactions.add(message2, { type: MessageReactionType.Unique, name: '❤️' }),
      room2.messages.reactions.add(message2, { type: MessageReactionType.Unique, name: '👍' }),
    ]);

    await vi.waitFor(
      () => {
        const message2Summary = found.findLast((e) => e.summary.messageSerial === message2.serial);
        expect(message2Summary).toBeDefined();
        expect(message2Summary).toMatchObject({
          type: MessageReactionEventType.Summary,
          summary: {
            messageSerial: message2.serial,
            unique: {
              '❤️': {
                total: 1,
                clientIds: [chat.clientId],
              },
              '👍': {
                total: 1,
                clientIds: [client2.clientId],
              },
            },
          },
        });
      },
      { timeout: 30_000 },
    );

    void room.detach();
    void room2.detach();
  });
});
