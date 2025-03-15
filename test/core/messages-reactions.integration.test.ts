import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import {
  MessageReactionEvents,
  MessageReactionRawEvent,
  MessageReactionSummaryEvent,
  MessageReactionType,
} from '../../src/core/events.ts';
import { AllFeaturesEnabled } from '../../src/core/room-options.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForArrayLength } from '../helper/common.ts';
import { getRandomRoom } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
}

describe('message reactions integration', { timeout: 10000 }, () => {
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
  });

  it<TestContext>('should be able to send and receive raw message reactions', async (context) => {
    const { chat } = context;

    const room = await getRandomRoom(chat);

    // Attach the room
    await room.attach();

    // Send a message
    const message1 = await room.messages.send({ text: 'Hello there!' });

    // Subscribe to reactions and add them to a list when they arrive
    const found: MessageReactionRawEvent[] = [];
    room.messages.reactions.subscribeRaw((reactionEvent) => {
      found.push(reactionEvent);
    });

    await room.messages.reactions.add(message1, MessageReactionType.Unique, '👍');
    await room.messages.reactions.add(message1, MessageReactionType.Distinct, '🚀');
    await room.messages.reactions.add(message1, MessageReactionType.Multiple, '🙈', 10);

    await waitForArrayLength(found, 3);

    expect(found[0]).toMatchObject({
      type: MessageReactionEvents.Create,
      reactionType: MessageReactionType.Unique,
      reaction: '👍',
      messageSerial: message1.serial,
      clientId: chat.clientId,
    });

    expect(found[1]).toMatchObject({
      type: MessageReactionEvents.Create,
      reactionType: MessageReactionType.Distinct,
      reaction: '🚀',
      messageSerial: message1.serial,
      clientId: chat.clientId,
    });

    expect(found[2]).toMatchObject({
      type: MessageReactionEvents.Create,
      reactionType: MessageReactionType.Multiple,
      reaction: '🙈',
      count: 10,
      messageSerial: message1.serial,
      clientId: chat.clientId,
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

    await Promise.all([
      room.messages.reactions.add(message1, MessageReactionType.Multiple, '👍'),
      room.messages.reactions.add(message1, MessageReactionType.Multiple, '👍', 10),
      room.messages.reactions.add(message1, MessageReactionType.Multiple, '🚀', 2),
      room.messages.reactions.add(message1, MessageReactionType.Multiple, '💚'),
    ]);

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEvents.Summary,
          messageSerial: message1.serial,
          multiple: {
            '👍': {
              total: 11,
              clientIds: {
                [chat.clientId]: 11,
              },
            },
            '🚀': {
              total: 2,
              clientIds: {
                [chat.clientId]: 2,
              },
            },
            '💚': {
              total: 1,
              clientIds: {
                [chat.clientId]: 1,
              },
            },
          },
        });
      },
      { timeout: 10_000 },
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
    const room2 = await client2.rooms.get(room.roomId, AllFeaturesEnabled);
    await room2.attach();

    const client3 = newChatClient();
    const room3 = await client3.rooms.get(room.roomId, AllFeaturesEnabled);
    await room3.attach();

    await Promise.all([
      room.messages.reactions.add(message1, MessageReactionType.Distinct, '👍'),
      room.messages.reactions.add(message1, MessageReactionType.Distinct, '🥦'),
      room2.messages.reactions.add(message1, MessageReactionType.Distinct, '👍'),
      room2.messages.reactions.add(message1, MessageReactionType.Distinct, '❤️'),
      room2.messages.reactions.add(message1, MessageReactionType.Distinct, '❤️'),
      room3.messages.reactions.add(message1, MessageReactionType.Distinct, '🥥'),
      room3.messages.reactions.add(message1, MessageReactionType.Distinct, '🥥'),
    ]);

    void room2.detach();
    void room3.detach();

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEvents.Summary,
          messageSerial: message1.serial,
          distinct: {
            '👍': {
              total: 2,
              clientIds: {
                [chat.clientId]: 11,
                [client2.clientId]: 11,
              },
            },
            '🥦': {
              total: 1,
              clientIds: {
                [chat.clientId]: 1,
              },
            },
            '❤️': {
              total: 1,
              clientIds: {
                [client2.clientId]: 1,
              },
            },
            '🥥': {
              total: 1,
              clientIds: {
                [client3.clientId]: 1,
              },
            },
          },
        });
      },
      { timeout: 10_000 },
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
    const room2 = await client2.rooms.get(room.roomId, AllFeaturesEnabled);
    await room2.attach();

    await Promise.all([
      // First client reactions - only the last one (❤️) should remain
      room.messages.reactions.add(message1, MessageReactionType.Unique, '👍'),
      room.messages.reactions.add(message1, MessageReactionType.Unique, '🚀'),
      room.messages.reactions.add(message1, MessageReactionType.Unique, '❤️'),

      // Second client reactions - only the last one (👍) should remain
      room2.messages.reactions.add(message1, MessageReactionType.Unique, '🌟'),
      room2.messages.reactions.add(message1, MessageReactionType.Unique, '👍'),
    ]);

    void room2.detach();

    await vi.waitFor(
      () => {
        expect(found.length).toBeGreaterThanOrEqual(1);
        const latestSummary = found.at(-1);
        expect(latestSummary).toMatchObject({
          type: MessageReactionEvents.Summary,
          messageSerial: message1.serial,
          unique: {
            '❤️': {
              total: 1,
              clientIds: {
                [chat.clientId]: 1,
              },
            },
            '👍': {
              total: 1,
              clientIds: {
                [client2.clientId]: 1,
              },
            },
          },
        });
      },
      { timeout: 10_000 },
    );

    // Send another message and react with same emojis, make sure emojis are unique per-message
    const message2 = await room.messages.send({ text: 'Another message' });
    await Promise.all([
      room.messages.reactions.add(message2, MessageReactionType.Unique, '❤️'),
      room2.messages.reactions.add(message2, MessageReactionType.Unique, '👍'),
    ]);

    await vi.waitFor(
      () => {
        const message2Summary = found.find((e) => e.messageSerial === message2.serial);
        expect(message2Summary).toMatchObject({
          type: MessageReactionEvents.Summary,
          messageSerial: message2.serial,
          unique: {
            '❤️': {
              total: 1,
              clientIds: {
                [chat.clientId]: 1,
              },
            },
            '👍': {
              total: 1,
              clientIds: {
                [client2.clientId]: 1,
              },
            },
          },
        });
      },
      { timeout: 10_000 },
    );
  });
});
