import { describe, expect, it } from 'vitest';

import { DefaultTimeserial } from '../../src/core/timeserial.ts';

describe('calculateTimeserial', () => {
  it('parses a valid timeserial', () => {
    const timeserial = 'abcdefghij@1672531200000-123:1';
    const result = DefaultTimeserial.calculateTimeserial(timeserial);
    expect(result).toEqual({
      seriesId: 'abcdefghij',
      timestamp: 1672531200000,
      counter: 123,
      index: 1,
    });
  });

  it.each([
    ['abcdefghij@1672531200000'], // No counter
    ['abcdefghij@'], // No timestamp
    ['abcdefghij'], // No series id
  ])('throws an error with an invalid timeserial %s', (timeserial) => {
    expect(() => {
      DefaultTimeserial.calculateTimeserial(timeserial);
    }).toThrowErrorInfo({
      code: 50000,
      message: 'invalid timeserial',
    });
  });

  it('should be equal to the same timeserial', () => {
    const timeserial = 'abcdefghij@1672531200000-123:1';
    const result = DefaultTimeserial.calculateTimeserial(timeserial);
    expect(result.equal(timeserial)).toBe(true);
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
  ])(`is before another timeserial %s, %s -> %o`, (firstTimeserialString, secondTimeserialString, expected) => {
    const firstTimeserial = DefaultTimeserial.calculateTimeserial(firstTimeserialString);
    const secondTimeserial = DefaultTimeserial.calculateTimeserial(secondTimeserialString);

    expect(firstTimeserial.before(secondTimeserial)).toBe(expected);
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
  ])('is after another timeserial %s, %s -> %o', (firstTimeserialString, secondTimeserialString, expected) => {
    const firstTimeserial = DefaultTimeserial.calculateTimeserial(firstTimeserialString);
    const secondTimeserial = DefaultTimeserial.calculateTimeserial(secondTimeserialString);
    expect(firstTimeserial.after(secondTimeserial)).toBe(expected);
  });

  it('should return the original timeserial as a string', () => {
    const timeserial = 'abcdefghij@1672531200000-123:1';
    const result = DefaultTimeserial.calculateTimeserial(timeserial);
    expect(result.toString()).toBe(timeserial);
  });
});
