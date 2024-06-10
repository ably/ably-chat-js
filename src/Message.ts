/**
 * Represents a single message in a chat room.
 */
export interface Message {
  /**
   * The unique identifier of the message.
   */
  readonly timeserial: string;

  /**
   * The clientId of the user who created the message.
   */
  readonly clientId: string;

  /**
   * The roomId of the chat room to which the message belongs.
   */
  readonly roomId: string;

  /**
   * The text content of the message.
   */
  readonly content: string;

  /**
   * The timestamp at which the message was created.
   */
  readonly createdAt: number;

  /**
   * Determines if this message was created before the given message.
   * @param message The message to compare against.
   * @returns true if this message was created before the given message, in global order.
   */
  before(message: Message): boolean;

  /**
   * Determines if this message was created after the given message.
   * @param message The message to compare against.
   * @returns true if this message was created after the given message, in global order.
   */
  after(message: Message): boolean;

  /**
   * Determines if this message is equal to the given message.
   * @param message The message to compare against.
   * @returns true if this message is equal to the given message.
   */
  equal(message: Message): boolean;
}

/**
 * Represents a parsed timeserial.
 */
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
export class DefaultMessage implements Message {
  private readonly _calculatedTimeserial: Timeserial;

  constructor(
    public readonly timeserial: string,
    public readonly clientId: string,
    public readonly roomId: string,
    public readonly content: string,
    public readonly createdAt: number,
  ) {
    this._calculatedTimeserial = DefaultMessage.calculateTimeserial(timeserial);

    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }

  before(message: Message): boolean {
    return DefaultMessage.timeserialCompare(this, message) < 0;
  }

  after(message: Message): boolean {
    return DefaultMessage.timeserialCompare(this, message) > 0;
  }

  equal(message: Message): boolean {
    return DefaultMessage.timeserialCompare(this, message) === 0;
  }

  /**
   * Compares two timeserials and returns a number indicating their order.
   *
   * 0 if the timeserials are equal.
   * <0 if the first timeserial is less than the second.
   * >0 if the first timeserial is greater than the second.
   *
   * @throws {@link ErrorInfo} if timeserial of either message is invalid.
   */
  private static timeserialCompare(first: Message, second: Message): number {
    const firstTimeserial =
      (first as DefaultMessage)._calculatedTimeserial ?? DefaultMessage.calculateTimeserial(first.timeserial);
    const secondTimeserial =
      (second as DefaultMessage)._calculatedTimeserial ?? DefaultMessage.calculateTimeserial(second.timeserial);

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
   * @throws {@link ErrorInfo} if timeserial is invalid.
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
