import { describe, expect, it } from 'vitest';

import { DefaultMessage } from '../../src/core/Message.js';

describe('ChatMessage', () => {
  it('is the same as another message', () => {
    const firstTimeserial = 'abcdefghij@1672531200000-123';
    const secondTimeserial = 'abcdefghij@1672531200000-123';

    const firstMessage = new DefaultMessage(
      firstTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );
    const secondMessage = new DefaultMessage(
      secondTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );

    expect(firstMessage.equal(secondMessage)).toBe(true);
  });

  it('is not the same as another message', () => {
    const firstTimeserial = 'abcdefghij@1672531200000-123';
    const secondTimeserial = 'abcdefghij@1672531200000-124';

    const firstMessage = new DefaultMessage(
      firstTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );
    const secondMessage = new DefaultMessage(
      secondTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );

    expect(firstMessage.equal(secondMessage)).toBe(false);
  });

  it('is before another message', () => {
    const firstTimeserial = 'abcdefghij@1672531200000-123';
    const secondTimeserial = 'abcdefghij@1672531200000-124';

    const firstMessage = new DefaultMessage(
      firstTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );
    const secondMessage = new DefaultMessage(
      secondTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );

    expect(firstMessage.before(secondMessage)).toBe(true);
  });
  it('is after another message', () => {
    const firstTimeserial = 'abcdefghij@1672531200000-124';
    const secondTimeserial = 'abcdefghij@1672531200000-123';

    const firstMessage = new DefaultMessage(
      firstTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );
    const secondMessage = new DefaultMessage(
      secondTimeserial,
      'clientId',
      'roomId',
      'hello there',
      new Date(1672531200000),
      {},
      {},
    );

    expect(firstMessage.after(secondMessage)).toBe(true);
  });

  it('throws an error with an invalid timeserial', async () => {
    await expect(async () => {
      new DefaultMessage(
        'not a valid timeserial',
        'clientId',
        'roomId',
        'hello there',
        new Date(1672531200000),
        {},
        {},
      );
      return Promise.resolve();
    }).rejects.toBeErrorInfo({
      code: 50000,
      message: 'invalid timeserial',
    });
  });
});
