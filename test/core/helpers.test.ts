import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { ChatMessageActions, RealtimeMessageNames } from '../../src/core/events.js';
import { RoomReactionEvents } from '../../src/core/events.ts';
import { chatMessageFromEncoded, getEntityTypeFromEncoded, reactionFromEncoded } from '../../src/core/helpers.js';
import { DefaultMessage } from '../../src/core/message.js';
import { DefaultReaction } from '../../src/core/reaction.js';

const TEST_ENVELOPED_MESSAGE = {
  id: 'chat:6TP2sA:some-room:219f7afc614af7b:0',
  clientId: 'user1',
  timestamp: 1719948956834,
  encoding: 'json',
  action: 1,
  version: '01719948956834-000@108TeGZDQBderu97202638',
  extras: {
    headers: {},
  },
  data: '{"text":"I have the high ground now","metadata":{}}',
  name: 'chat.message',
};

const TEST_ENVELOPED_ROOM_REACTION = {
  id: 'NtORcEMDdH:0:0',
  clientId: 'user1',
  connectionId: 'NtORcEMDdH',
  timestamp: 1719948877991,
  encoding: 'json',
  data: '{"type":"like"}',
  name: 'roomReaction',
  serial: '01719948956834-000@108TeGZDQBderu97202638',
  action: 1,
};

describe('helpers', () => {
  describe('fromEncodedChatMessage', () => {
    it('should return a chat message', async () => {
      const result = await chatMessageFromEncoded(TEST_ENVELOPED_MESSAGE);
      expect(result).toEqual(
        new DefaultMessage(
          '01719948956834-000@108TeGZDQBderu97202638',
          'user1',
          'some-room',
          'I have the high ground now',
          {},
          {},
          ChatMessageActions.MessageCreate,
          '01719948956834-000@108TeGZDQBderu97202638',
          new Date(1719948956834),
          new Date(1719948956834),
        ),
      );
    });

    it('should throw an error if message does not match a chat message type', async () => {
      await expect(async () => {
        await chatMessageFromEncoded({
          id: 'chat:6TP2sA:some-room:219f7afc614af7b:0',
          clientId: 'user1',
          timestamp: 1719948956834,
          encoding: 'json',
          action: 1,
          serial: '01719948956834-000@108TeGZDQBderu97202638',
          extras: {
            headers: {},
          },
          name: 'chat.message',
        });
      }).rejects.toBeErrorInfo({
        code: 50000,
        message: 'received incoming message without data',
      });
    });
  });

  describe('fromEncodedRoomReaction', () => {
    it('should return a room reaction', async () => {
      const result = await reactionFromEncoded(TEST_ENVELOPED_ROOM_REACTION);
      expect(result).toEqual(new DefaultReaction('like', 'user1', new Date(1719948877991), false, {}, {}));
    });

    it('should throw an error if message does not match a room reaction type', async () => {
      await expect(async () => {
        await reactionFromEncoded({
          id: 'NtORcEMDdH:0:0',
          clientId: 'user1',
          connectionId: 'NtORcEMDdH',
          timestamp: 1719948877991,
          encoding: 'json',
          action: 1,
          name: 'chat.message',
        });
      }).rejects.toBeErrorInfo({
        code: 50000,
        message: 'received incoming message without data',
      });
    });
  });

  describe('getEntityTypeFromEncoded', () => {
    describe.each([
      {
        description: 'encoded is undefined',
        encoded: undefined,
        expectedError: 'invalid encoded type; encoded is not type object or is null',
      },
      {
        description: 'encoded is null',
        encoded: null,
        expectedError: 'invalid encoded type; encoded is not type object or is null',
      },
      {
        description: 'encoded does not have a name property',
        encoded: { notName: 'notName' },
        expectedError: 'invalid encoded inbound message; message does not have a valid name field',
      },
      {
        description: 'name property is undefined',
        encoded: { name: undefined },
        expectedError: 'invalid encoded inbound message; message does not have a valid name field',
      },
      {
        description: 'name property is unknown',
        encoded: { name: 'unknownEvent' },
        expectedError: 'unknown message type: unknownEvent',
      },
    ])('should throw an error', ({ description, encoded, expectedError }) => {
      it(`should throw an error is ${description}`, () => {
        expect(() => {
          getEntityTypeFromEncoded(encoded);
        }).toThrowErrorInfo({
          code: 40000,
          message: expectedError,
        });
      });
    });

    it('should return "chatMessage" for MessageEvents.created', () => {
      const message = { name: RealtimeMessageNames.ChatMessage } as Ably.InboundMessage;
      const result = getEntityTypeFromEncoded(message);
      expect(result).toBe('chatMessage');
    });

    it('should return "roomReaction" for RoomReactionEvents.reaction', () => {
      const message = { name: RoomReactionEvents.Reaction } as Ably.InboundMessage;
      const result = getEntityTypeFromEncoded(message);
      expect(result).toBe('reaction');
    });
  });
});
