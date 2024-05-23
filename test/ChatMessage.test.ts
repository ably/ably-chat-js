import { ChatMessage } from '../src/ChatMessage.js';
import { describe, it, expect } from 'vitest';

describe('ChatMessage', () => {
  it('is the same as another message', () => {
    const firstTimeserial = 'abcdefghij@1672531200000-123';
    const secondTimeserial = 'abcdefghij@1672531200000-123';

    const firstMessage = new ChatMessage(firstTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);
    const secondMessage = new ChatMessage(secondTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);

    expect(firstMessage.equal(secondMessage)).toBe(true);
  });

  it('is not the same as another message', () => {
    const firstTimeserial = 'abcdefghij@1672531200000-123';
    const secondTimeserial = 'abcdefghij@1672531200000-124';

    const firstMessage = new ChatMessage(firstTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);
    const secondMessage = new ChatMessage(secondTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);

    expect(firstMessage.equal(secondMessage)).toBe(false);
  });

  it.each([
    ['abcdefghij@1672531200000-123:1', 'abcdefghij@1672531200000-124:2', true], // Earlier index
    ['abcdefghij@1672531200000-124:2', 'abcdefghij@1672531200000-123:1', false], // Later index
    ['abcdefghij@1672531200000-123:1', 'abcdefghij@1672531200000-123:1', false], // Same index
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-124', true], // Earlier counter
    ['abcdefghij@1672531200000-124', 'abcdefghij@1672531200000-123', false], // Later counter
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-123', false], // Same counter
    ['abcdefghi@1672531200000-123', 'abcdefghij@1672531200000-123', true], // Earlier series id
    ['abcdefghij@1672531200000-123', 'abcdefghi@1672531200000-123', false], // Later series id
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-123', false], // Same series id
    ['abcdefghi@1672531200000-123', 'abcdefghij@1672531200001-123', true], // Earlier timestamp
    ['abcdefghij@1672531200001-123', 'abcdefghij@1672531200000-123', false], // Later timestamp
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-123', false], // Same timestamp]
  ])(`is before another message %s, %s -> %o`, (firstTimeserial, secondTimeserial, expected) => {
    const firstMessage = new ChatMessage(firstTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);
    const secondMessage = new ChatMessage(secondTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);

    expect(firstMessage.before(secondMessage)).toBe(expected);
  });

  it.each([
    ['abcdefghij@1672531200000-123:1', 'abcdefghij@1672531200000-124:2', false], // Earlier index
    ['abcdefghij@1672531200000-124:2', 'abcdefghij@1672531200000-123:1', true], // Later index
    ['abcdefghij@1672531200000-123:1', 'abcdefghij@1672531200000-123:1', false], // Same index
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-124', false], // Earlier counter
    ['abcdefghij@1672531200000-124', 'abcdefghij@1672531200000-123', true], // Later counter
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-123', false], // Same counter
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-124', false], // Earlier series id
    ['abcdefghij@1672531200000-124', 'abcdefghij@1672531200000-123', true], // Later series id
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-123', false], // Same series id
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200001-123', false], // Earlier timestamp
    ['abcdefghij@1672531200001-123', 'abcdefghij@1672531200000-123', true], // Later timestamp
    ['abcdefghij@1672531200000-123', 'abcdefghij@1672531200000-123', false], // Same timestamp
  ])('is after another message %s, %s -> %o', (firstTimeserial, secondTimeserial, expected) => {
    const firstMessage = new ChatMessage(firstTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);
    const secondMessage = new ChatMessage(secondTimeserial, 'clientId', 'roomId', 'hello there', 1672531200000);

    expect(firstMessage.after(secondMessage)).toBe(expected);
  });

  it.each([
    ['abcdefghij@1672531200000'], // No counter
    ['abcdefghij@'], // No timestamp
    ['abcdefghij'], // No series id
  ])('throws an error with an invalid timeserial %s', (timeserial) => {
    expect(() => new ChatMessage(timeserial, 'clientId', 'roomId', 'hello there', 1672531200000)).toThrow(
      new Error('Invalid timeserial'),
    );
  });
});
