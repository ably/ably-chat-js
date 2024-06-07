import { Message } from './entities.js';

interface Timeserial {
  seriesId: string;
  timestamp: number;
  counter: number;
  index?: number;
}

/**
 * An implementation of the Message interface for chat messages.
 *
 * Allows for comparison of messages based on their timeserials.
 */
export class ChatMessage implements Message {
  private readonly _calculatedTimeserial: Timeserial;

  constructor(
    public readonly timeserial: string,
    public readonly clientId: string,
    public readonly roomId: string,
    public readonly content: string,
    public readonly createdAt: number,
  ) {
    this._calculatedTimeserial = ChatMessage.calculateTimeserial(timeserial);

    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }

  before(message: Message): boolean {
    return ChatMessage.timeserialCompare(this, message) < 0;
  }

  after(message: Message): boolean {
    return ChatMessage.timeserialCompare(this, message) > 0;
  }

  equal(message: Message): boolean {
    return ChatMessage.timeserialCompare(this, message) === 0;
  }

  /**
   * Compares two timeserials and returns a number indicating their order.
   *
   * 0 if the timeserials are equal.
   * <0 if the first timeserial is less than the second.
   * >0 if the first timeserial is greater than the second.
   *
   * @throws Error if timeserial of either message is invalid.
   */
  private static timeserialCompare(first: Message, second: Message): number {
    const firstTimeserial = (first as ChatMessage)._calculatedTimeserial
      ? (first as ChatMessage)._calculatedTimeserial
      : ChatMessage.calculateTimeserial(first.timeserial);
    const secondTimeserial = (second as ChatMessage)._calculatedTimeserial
      ? (second as ChatMessage)._calculatedTimeserial
      : ChatMessage.calculateTimeserial(second.timeserial);

    // Compare the timestamp
    const timestampDiff = firstTimeserial.timestamp - secondTimeserial.timestamp;
    if (timestampDiff) {
      return timestampDiff;
    }

    // Compare the counter
    const counterDiff = firstTimeserial.counter - secondTimeserial.counter;
    if (counterDiff) {
      return counterDiff;
    }

    // Compare the seriesId lexicographically
    const seriesIdDiff =
      firstTimeserial.seriesId !== secondTimeserial.seriesId &&
      (firstTimeserial.seriesId < secondTimeserial.seriesId ? -1 : 1);

    if (seriesIdDiff) {
      return seriesIdDiff;
    }

    // Compare the index, if present
    return firstTimeserial.index !== undefined && secondTimeserial.index !== undefined
      ? firstTimeserial.index - secondTimeserial.index
      : 0;
  }

  /**
   * Calculate the timeserial object from a timeserial string.
   *
   * @throws Error if timeserial is invalid.
   */
  private static calculateTimeserial(timeserial: string): Timeserial {
    const [seriesId, rest] = timeserial.split('@');
    if (!seriesId || !rest) {
      throw new Error('Invalid timeserial');
    }

    const [timestamp, counterAndIndex] = rest.split('-');
    if (!timestamp || !counterAndIndex) {
      throw new Error('Invalid timeserial');
    }

    const [counter, index] = counterAndIndex.split(':');
    if (!counter) {
      throw new Error('Invalid timeserial');
    }

    return {
      seriesId,
      timestamp: Number(timestamp),
      counter: Number(counter),
      index: index ? Number(index) : undefined,
    };
  }
}
