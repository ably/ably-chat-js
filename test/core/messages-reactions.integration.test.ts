import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { ErrorCode } from '../../src/core/errors.ts';
import {
  MessageReactionRawEvent,
  MessageReactionRawEventType,
  MessageReactionSummaryEvent,
  MessageReactionSummaryEventType,
  MessageReactionType,
} from '../../src/core/events.ts';
import { newChatClient, waitForClientId } from '../helper/chat.ts';
import { waitForArrayLength } from '../helper/common.ts';
import { randomRoomName } from '../helper/identifier.ts';
import { getRandomRoom } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
  clientId: string;
}

describe('message reactions integration', { timeout: 60000 }, () => {
  beforeEach<TestContext>(async (context) => {
    context.chat = newChatClient();
    context.clientId = await waitForClientId(context.chat);
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

    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Unique, name: '👍' });
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '🚀' });
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Multiple, name: '🙈', count: 10 });
    await room.messages.reactions.delete(message1.serial, { type: MessageReactionType.Distinct, name: '🚀' });

    await waitForArrayLength(found, 4);

    expect(found[0]).toMatchObject({
      type: MessageReactionRawEventType.Create,
      reaction: {
        type: MessageReactionType.Unique,
        name: '👍',
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });

    expect(found[1]).toMatchObject({
      type: MessageReactionRawEventType.Create,
      reaction: {
        type: MessageReactionType.Distinct,
        name: '🚀',
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });

    expect(found[2]).toMatchObject({
      type: MessageReactionRawEventType.Create,
      reaction: {
        type: MessageReactionType.Multiple,
        name: '🙈',
        count: 10,
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });

    expect(found[3]).toMatchObject({
      type: MessageReactionRawEventType.Delete,
      reaction: {
        type: MessageReactionType.Distinct,
        name: '🚀',
        messageSerial: message1.serial,
        clientId: chat.clientId,
      },
    });
  });

  it<TestContext>('should be able to receive reaction summaries: multiple', async (context) => {
    const { chat, clientId } = context;

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

    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Multiple, name: '👍' });
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Multiple, name: '👍', count: 10 });
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Multiple, name: '❤️', count: 3 });

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
            multiple: {
              '👍': {
                total: 11,
                clientIds: {
                  [clientId]: 11,
                },
              },
              '❤️': {
                total: 3,
                clientIds: {
                  [clientId]: 3,
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

    await room.messages.reactions.delete(message1.serial, { type: MessageReactionType.Multiple, name: '❤️' });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
            multiple: {
              '👍': {
                total: 11,
                clientIds: {
                  [clientId]: 11,
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
      room.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '👍' }),
      room.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '🥦' }),
      room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '👍' }),
      room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '❤️' }),
      room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '❤️' }),
      room3.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '🥥' }),
      room3.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '🥥' }),
    ]);

    void room2.detach();
    void room3.detach();

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        latestSummary?.reactions.distinct['👍']?.clientIds.sort();
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
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

    await room.messages.reactions.delete(message1.serial, { type: MessageReactionType.Distinct, name: '👍' });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
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
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Unique, name: '👍' });
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Unique, name: '🚀' });
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Unique, name: '❤️' });
    // Second client reactions - only the last one (👍) should remain
    await room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Unique, name: '🌟' });
    await room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Unique, name: '👍' });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
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
    await room.messages.reactions.delete(message1.serial, { type: MessageReactionType.Unique });
    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
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
      room.messages.reactions.send(message2.serial, { type: MessageReactionType.Unique, name: '❤️' }),
      room2.messages.reactions.send(message2.serial, { type: MessageReactionType.Unique, name: '👍' }),
    ]);

    await vi.waitFor(
      () => {
        const message2Summary = found.findLast((e) => e.messageSerial === message2.serial);
        expect(message2Summary).toBeDefined();
        expect(message2Summary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message2.serial,
          reactions: {
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

  it<TestContext>('should fetch clientReactions for specific client after receiving summary', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Create a second client
    const client2 = newChatClient();
    const room2 = await client2.rooms.get(room.name);
    await room2.attach();

    // Send a message
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to reaction summaries and collect them
    const summaryEvents: MessageReactionSummaryEvent[] = [];
    room.messages.reactions.subscribe((event) => {
      summaryEvents.push(event);
    });

    // Send three reactions: one from client1, two from client2
    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '❤️' });
    await room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '❤️' });
    await room2.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '🚀' });

    // Wait for summary events to be received
    await vi.waitFor(
      () => {
        expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
        const latestSummary = summaryEvents.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionSummaryEventType.Summary,
          messageSerial: message1.serial,
          reactions: {
            distinct: {
              '❤️': {
                total: 2,
                clientIds: [chat.clientId, client2.clientId],
              },
              '🚀': {
                total: 1,
                clientIds: [client2.clientId],
              },
            },
            unique: {},
            multiple: {},
          },
        });
      },
      { timeout: 30_000 },
    );

    // Fetch clientReactions for client2 (the one with two reactions)
    const client2Reactions = await room.messages.reactions.clientReactions(message1.serial, client2.clientId);

    // Verify that client2Reactions only contains reactions from client2
    expect(client2Reactions.distinct).toMatchObject({
      '❤️': {
        total: 2,
        clientIds: [client2.clientId],
      },
      '🚀': {
        total: 1,
        clientIds: [client2.clientId],
      },
    });

    // Fetch clientReactions for client1 (the one with one reaction) for comparison
    const client1Reactions = await room.messages.reactions.clientReactions(message1.serial, chat.clientId);

    // Verify that client1Reactions only contains reactions from client1
    expect(client1Reactions.distinct).toMatchObject({
      '❤️': {
        total: 2,
        clientIds: [chat.clientId],
      },
    });

    // Verify that client1Reactions does NOT contain reactions from client2
    expect(client1Reactions.distinct['🚀']).toBeUndefined();

    // Clean up
    void room2.detach();
  });

  it('should be able to send and receive raw message reactions with a user claim', async () => {
    const roomName = randomRoomName();
    const roomClaim = `ably.room.${roomName}`;
    const chat = newChatClient(undefined, undefined, { [roomClaim]: 'test-claim-value' });
    await waitForClientId(chat);

    const room = await chat.rooms.get(roomName, { messages: { rawMessageReactions: true } });
    await room.attach();

    // Send a message to react to
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to raw reactions
    const found: MessageReactionRawEvent[] = [];
    room.messages.reactions.subscribeRaw((reactionEvent) => {
      found.push(reactionEvent);
    });

    await room.messages.reactions.send(message1.serial, { type: MessageReactionType.Distinct, name: '👍' });

    await waitForArrayLength(found, 1);

    expect(found[0]?.reaction.userClaim).toBe('test-claim-value');
  });

  it<TestContext>('should reject reactions to a deleted message but allow deleting existing ones', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    const message = await room.messages.send({ text: 'Hello there!' });
    await room.messages.reactions.send(message.serial, { type: MessageReactionType.Distinct, name: '👍' });
    await room.messages.delete(message.serial);

    await expect(
      room.messages.reactions.send(message.serial, { type: MessageReactionType.Distinct, name: '🚀' }),
    ).rejects.toBeErrorInfoWithCode(ErrorCode.MessageReactionTargetDeleted);

    // rejects if the delete is refused
    await room.messages.reactions.delete(message.serial, { type: MessageReactionType.Distinct, name: '👍' });
  });
});
