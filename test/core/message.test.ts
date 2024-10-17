import { Message } from '@ably/chat';
import { describe, expect, it } from 'vitest';

import { ChatMessageActions } from '../../src/core/events.ts';
import { DefaultMessage } from '../../src/core/message.ts';

describe('ChatMessage', () => {
  it('should correctly parse createdAt from serial', () => {
    const serial = 'abcdefghij@1672531200000-123';

    const message = new DefaultMessage(
      serial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      serial,
    );

    expect(message.createdAt).toEqual(new Date(1672531200000));
  });

  it('is the same as another message', () => {
    const firstSerial = 'abcdefghij@1672531200000-123';
    const secondSerial = 'abcdefghij@1672531200000-123';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
    );
    const secondMessage = new DefaultMessage(
      secondSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      secondSerial,
    );

    expect(firstMessage.equal(secondMessage)).toBe(true);
  });

  it('is not the same as another message', () => {
    const firstSerial = 'abcdefghij@1672531200000-123';
    const secondSerial = 'abcdefghij@1672531200000-124';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
    );
    const secondMessage = new DefaultMessage(
      secondSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      secondSerial,
    );

    expect(firstMessage.equal(secondMessage)).toBe(false);
  });

  it('is before another message', () => {
    const firstSerial = 'abcdefghij@1672531200000-123';
    const secondSerial = 'abcdefghij@1672531200000-124';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
    );
    const secondMessage = new DefaultMessage(
      secondSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      secondSerial,
    );

    expect(firstMessage.before(secondMessage)).toBe(true);
  });
  it('is after another message', () => {
    const firstSerial = 'abcdefghij@1672531200000-124';
    const secondSerial = 'abcdefghij@1672531200000-123';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
    );
    const secondMessage = new DefaultMessage(
      secondSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      secondSerial,
    );

    expect(firstMessage.after(secondMessage)).toBe(true);
  });

  it('throws an error with an invalid serial', () => {
    expect(() => {
      new DefaultMessage(
        'not a valid serial',
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageCreate,
        'not a valid serial',
      );
    }).toThrowErrorInfo({
      code: 50000,
      message: 'invalid serial',
    });
  });

  describe('message actions', () => {
    it('is deleted', () => {
      const firstSerial = 'abcdefghij@1672531200000-124:0';
      const firstMessage = new DefaultMessage(
        firstSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageDelete,
        'abcdefghij@1672531200000-123:0',
        new Date(1672531300000),
        undefined,
        {
          clientId: 'clientId2',
        },
      );
      expect(firstMessage.isDeleted).toBe(true);
      expect(firstMessage.deletedBy).toBe('clientId2');
    });

    it('is updated', () => {
      const firstSerial = 'abcdefghij@1672531200000-124';
      const firstMessage = new DefaultMessage(
        firstSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        'abcdefghij@1672531200000-123:0',
        undefined,
        new Date(1672531300000),
        { clientId: 'clientId2' },
      );
      expect(firstMessage.isUpdated).toBe(true);
      expect(firstMessage.updatedBy).toBe('clientId2');
    });

    it(`throws an error when trying to compare actions belonging to different origin messages`, () => {
      const firstSerial = 'abcdefghij@1672531200000-124';
      const secondSerial = 'abcdefghij@1672531200000-123';

      const firstActionSerial = 'abcdefghij@1672531200000-123:0';
      const secondActionSerial = 'abcdefghij@1672531200000-123:0';

      const firstMessage = new DefaultMessage(
        firstSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        firstActionSerial,
      );
      const secondMessage = new DefaultMessage(
        secondSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        secondActionSerial,
      );

      expect(() => firstMessage.actionEqual(secondMessage)).toThrowErrorInfo({
        code: 50000,
        message: 'actionEqual(): Cannot compare actions, message serials must be equal',
      });
    });

    describe.each([
      [
        'returns true when this message action is the same as another',
        {
          firstActionSerial: 'abcdefghij@1672531200000-123:0',
          secondActionSerial: 'abcdefghij@1672531200000-123:0',
          action: 'actionEqual',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.actionEqual(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'returns false when this message action is not same as another message action',
        {
          firstActionSerial: 'abcdefghij@1672531200000-123:0',
          secondActionSerial: 'abcdefghij@1672531200000-124:0',
          action: 'actionEqual',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.actionEqual(secondMessage)).toBe(false);
          },
        },
      ],
      [
        'returns true when this message action is before another message action',
        {
          firstActionSerial: 'abcdefghij@1672531200000-123:0',
          secondActionSerial: 'abcdefghij@1672531200000-124:0',
          action: 'actionBefore',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.actionBefore(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'returns true when this message action is after another message action',
        {
          firstActionSerial: 'abcdefghij@1672531200000-124:0',
          secondActionSerial: 'abcdefghij@1672531200000-123:0',
          action: 'actionAfter',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.actionAfter(secondMessage)).toBe(true);
          },
        },
      ],
    ])('compare message action serials', (name, { firstActionSerial, secondActionSerial, expected }) => {
      it(name, () => {
        const messageSerial = 'abcdefghij@1672531200000-123';
        const firstMessage = new DefaultMessage(
          messageSerial,
          'clientId',
          'roomId',
          'hello there',
          {},
          {},
          ChatMessageActions.MessageUpdate,
          firstActionSerial,
        );
        const secondMessage = new DefaultMessage(
          messageSerial,
          'clientId',
          'roomId',
          'hello there',
          {},
          {},
          ChatMessageActions.MessageUpdate,
          secondActionSerial,
        );
        expected(firstMessage, secondMessage);
      });
    });
  });
});
