import { Message } from '@ably/chat';
import { describe, expect, it } from 'vitest';

import { ChatMessageActions } from '../../src/core/events.ts';
import { DefaultMessage } from '../../src/core/message.ts';

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

    it(`should throw an error when trying to compare versions belonging to different origin messages`, () => {
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

      expect(() => firstMessage.versionEqual(secondMessage)).toThrowErrorInfo({
        code: 50000,
        message: 'versionEqual(): Cannot compare versions, message serials must be equal',
      });

      expect(() => firstMessage.versionBefore(secondMessage)).toThrowErrorInfo({
        code: 50000,
        message: 'versionBefore(): Cannot compare versions, message serials must be equal',
      });

      expect(() => firstMessage.versionAfter(secondMessage)).toThrowErrorInfo({
        code: 50000,
        message: 'versionAfter(): Cannot compare versions, message serials must be equal',
      });
    });

    describe.each([
      [
        'returns true when this message version is the same as another',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-123@abcdefghij:0',
          action: 'versionEqual',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.versionEqual(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'returns false when this message version is not same as another message version',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-124@abcdefghij:0',
          action: 'versionEqual',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.versionEqual(secondMessage)).toBe(false);
          },
        },
      ],
      [
        'returns true when this message version is before another message version',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-124@abcdefghij:0',
          action: 'versionBefore',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.versionBefore(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'returns true when this message version is after another message version',
        {
          firstVersion: '01672531200000-124@abcdefghij:0',
          secondVersion: '01672531200000-123@abcdefghij:0',
          action: 'versionAfter',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.versionAfter(secondMessage)).toBe(true);
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
});
