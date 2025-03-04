import { describe, expect, it } from 'vitest';

import { ChatMessageActions, MessageEvent, MessageEvents } from '../../src/core/events.ts';
import { DefaultMessage, Message } from '../../src/core/message.ts';

describe('ChatMessage', () => {
  it('is the same as another message', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-123@abcdefghij';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
      new Date(1672531200000),
      new Date(1672531200000),
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
      new Date(1672531200000),
      new Date(1672531200000),
    );

    expect(firstMessage.equal(secondMessage)).toBe(true);
  });

  it('is not the same as another message', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-124@abcdefghij';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
      new Date(1672531200000),
      new Date(1672531200000),
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
      new Date(1672531200000),
      new Date(1672531200000),
    );

    expect(firstMessage.equal(secondMessage)).toBe(false);
  });

  it('is the same as another message using isSameAs', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-123@abcdefghij';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
      new Date(1672531200000),
      new Date(1672531200000),
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
      new Date(1672531200000),
      new Date(1672531200000),
    );

    expect(firstMessage.isSameAs(secondMessage)).toBe(true);
  });

  it('is not the same as another message using isSameAs', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-124@abcdefghij';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
      new Date(1672531200000),
      new Date(1672531200000),
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
      new Date(1672531200000),
      new Date(1672531200000),
    );

    expect(firstMessage.isSameAs(secondMessage)).toBe(false);
  });

  it('is before another message', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-124@abcdefghij';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
      new Date(1672531200000),
      new Date(1672531200000),
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
      new Date(1672531200000),
      new Date(1672531200000),
    );

    expect(firstMessage.before(secondMessage)).toBe(true);
  });

  it('is after another message', () => {
    const firstSerial = '01672531200000-124@abcdefghij';
    const secondSerial = '01672531200000-123@abcdefghij';

    const firstMessage = new DefaultMessage(
      firstSerial,
      'clientId',
      'roomId',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      firstSerial,
      new Date(1672531200000),
      new Date(1672531200000),
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
      new Date(1672531200000),
      new Date(1672531200000),
    );

    expect(firstMessage.after(secondMessage)).toBe(true);
  });

  describe('message versions', () => {
    it('is deleted', () => {
      const firstSerial = '01672531200000-124@abcdefghij:0';
      const firstMessage = new DefaultMessage(
        firstSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageDelete,
        '01672531300000-123@abcdefghij:0',
        new Date(1672531200000),
        new Date(1672531300000),
        {
          clientId: 'clientId2',
        },
      );
      expect(firstMessage.isDeleted).toBe(true);
      expect(firstMessage.deletedBy).toBe('clientId2');
    });

    it('is updated', () => {
      const firstSerial = '01672531200000-124@abcdefghij';
      const firstMessage = new DefaultMessage(
        firstSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        '01672531200000-123@abcdefghij:0',
        new Date(1672531200000),
        new Date(1672531300000),
        { clientId: 'clientId2' },
      );
      expect(firstMessage.isUpdated).toBe(true);
      expect(firstMessage.updatedBy).toBe('clientId2');
    });

    it(`should return false when trying to compare versions belonging to different origin messages`, () => {
      const firstSerial = '01672531200000-124@abcdefghij';
      const secondSerial = '01672531200000-123@abcdefghij';

      const firstVersion = '01672531200000-123@abcdefghij:0';
      const secondVersion = '01672531200000-123@abcdefghij:0';

      const firstMessage = new DefaultMessage(
        firstSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        firstVersion,
        new Date(1672531200000),
        new Date(1672531200000),
      );
      const secondMessage = new DefaultMessage(
        secondSerial,
        'clientId',
        'roomId',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        secondVersion,
        new Date(1672531200000),
        new Date(1672531200000),
      );

      expect(firstMessage.isSameVersionAs(secondMessage)).toBe(false);
      expect(firstMessage.isOlderVersionOf(secondMessage)).toBe(false);
      expect(firstMessage.isNewerVersionOf(secondMessage)).toBe(false);
    });

    describe.each([
      [
        'returns true when this message version is the same as another',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-123@abcdefghij:0',
          action: 'isSameVersionAs',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isSameVersionAs(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'returns false when this message version is not same as another message version',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-124@abcdefghij:0',
          action: 'isSameVersionAs',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isSameVersionAs(secondMessage)).toBe(false);
          },
        },
      ],
      [
        'returns true when this message version is older than another message version',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-124@abcdefghij:0',
          action: 'isOlderVersionOf',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isOlderVersionOf(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'returns true when this message version is newer than another message version',
        {
          firstVersion: '01672531200000-124@abcdefghij:0',
          secondVersion: '01672531200000-123@abcdefghij:0',
          action: 'isNewerVersionOf',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isNewerVersionOf(secondMessage)).toBe(true);
          },
        },
      ],
    ])('compare message versions', (name, { firstVersion, secondVersion, expected }) => {
      it(name, () => {
        const messageSerial = '01672531200000-123@abcdefghij';
        const firstMessage = new DefaultMessage(
          messageSerial,
          'clientId',
          'roomId',
          'hello there',
          {},
          {},
          ChatMessageActions.MessageUpdate,
          firstVersion,
          new Date(1672531200000),
          new Date(1672531200001),
        );
        const secondMessage = new DefaultMessage(
          messageSerial,
          'clientId',
          'roomId',
          'hello there',
          {},
          {},
          ChatMessageActions.MessageUpdate,
          secondVersion,
          new Date(1672531200000),
          new Date(1672531200001),
        );
        expected(firstMessage, secondMessage);
      });
    });
  });

  describe('apply events with with()', () => {
    const message = new DefaultMessage(
      '01672531200000-123@abcdefghij',
      'yoda',
      'rebel-alliance-general',
      'hello there',
      {},
      {},
      ChatMessageActions.MessageCreate,
      '01672531200100-123@abcdefghij',
      new Date(1672531200000),
      new Date(1672531200000),
      undefined,
    );

    it('should throw an error if different messages', () => {
      const serial = '01672531200000-123@abcdefgxyz';
      const eventMessage = new DefaultMessage(
        serial,
        'yoda',
        'rebel-alliance-general',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        '01672531200500-123@abcdefghij',
        new Date(1672531200000),
        new Date(1672531200500),
        { clientId: 'luke' },
      );

      const event: MessageEvent = {
        type: MessageEvents.Updated,
        message: eventMessage,
      };

      expect(() => message.with(event)).toThrowErrorInfo({
        code: 40000,
        statusCode: 400,
        message: 'cannot apply event for a different message',
      });
    });

    it('should throw an error for create events messages', () => {
      const eventMessage = new DefaultMessage(
        message.serial,
        'yoda',
        'rebel-alliance-general',
        'hello there',
        {},
        {},
        ChatMessageActions.MessageCreate,
        '01672531200500-123@abcdefghij',
        new Date(1672531200000),
        new Date(1672531200500),
        { clientId: 'luke' },
      );

      const event: MessageEvent = {
        type: MessageEvents.Created,
        message: eventMessage,
      };

      expect(() => message.with(event)).toThrowErrorInfo({
        code: 40000,
        statusCode: 400,
        message: 'cannot apply a created event to a message',
      });
    });

    it('should correctly apply an UPDATE', () => {
      const eventMessage = new DefaultMessage(
        message.serial,
        'yoda',
        'rebel-alliance-general',
        'hi!',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        '01672531209999-123@abcdefghij',
        new Date(1672531200000),
        new Date(1672531209999),
        { clientId: 'luke' },
      );

      const event: MessageEvent = {
        type: MessageEvents.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage !== message).toBe(true);
      expect(newMessage).toEqual(eventMessage);
    });

    it('should correctly apply a DELETE', () => {
      const eventMessage = new DefaultMessage(
        message.serial,
        'yoda',
        'rebel-alliance-general',
        'hola',
        {},
        {},
        ChatMessageActions.MessageDelete,
        '01672531209999-123@abcdefghij',
        new Date(1672531200000),
        new Date(1672531209999),
        { clientId: 'luke' },
      );

      const event: MessageEvent = {
        type: MessageEvents.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage !== message).toBe(true);
      expect(newMessage).toEqual(eventMessage);
    });

    it('should ignore outdated versions', () => {
      const eventMessage = new DefaultMessage(
        message.serial,
        'yoda',
        'rebel-alliance-general',
        'old one',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        '01672531200000-123@abcdefghij',
        new Date(1672531200000),
        new Date(1672531209999),
        { clientId: 'luke' },
      );

      const event: MessageEvent = {
        type: MessageEvents.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage === message).toBe(true);
    });

    it('should ignore equal versions', () => {
      const eventMessage = new DefaultMessage(
        message.serial,
        'yoda',
        'rebel-alliance-general',
        'old one',
        {},
        {},
        ChatMessageActions.MessageUpdate,
        message.version,
        new Date(1672531200000),
        new Date(1672531209999),
        { clientId: 'luke' },
      );

      const event: MessageEvent = {
        type: MessageEvents.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage === message).toBe(true);
    });
  });
});
