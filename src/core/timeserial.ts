import * as Ably from 'ably';

/**
 * Represents a parsed timeserial.
 */
export interface Timeserial {
  /**
   * The series ID of the timeserial.
   */
  readonly seriesId: string;

  /**
   * The timestamp of the timeserial.
   */
  readonly timestamp: number;

  /**
   * The counter of the timeserial.
   */
  readonly counter: number;

  /**
   * The index of the timeserial.
   */
  readonly index?: number;

  toString(): string;

  before(timeserial: Timeserial | string): boolean;

  after(timeserial: Timeserial | string): boolean;

  equal(timeserial: Timeserial | string): boolean;
}

/**
 * Default implementation of the Timeserial interface. Used internally to parse and compare timeserials.
 *
 * @internal
 */
export class DefaultTimeserial implements Timeserial {
  public readonly seriesId: string;
  public readonly timestamp: number;
  public readonly counter: number;
  public readonly index?: number;

  private constructor(seriesId: string, timestamp: number, counter: number, index?: number) {
    this.seriesId = seriesId;
    this.timestamp = timestamp;
    this.counter = counter;
    this.index = index;
  }

  /**
   * Returns the string representation of the timeserial object.
   * @returns The timeserial string.
   */
  toString(): string {
    return `${this.seriesId}@${this.timestamp.toString()}-${this.counter.toString()}${this.index ? `:${this.index.toString()}` : ''}`;
  }

  /**
   * Calculate the timeserial object from a timeserial string.
   *
   * @param timeserial The timeserial string to parse.
   * @returns The parsed timeserial object.
   * @throws {@link ErrorInfo} if timeserial is invalid.
   */
  public static calculateTimeserial(timeserial: string): Timeserial {
    const [seriesId, rest] = timeserial.split('@');
    if (!seriesId || !rest) {
      throw new Ably.ErrorInfo('invalid timeserial', 50000, 500);
    }

    const [timestamp, counterAndIndex] = rest.split('-');
    if (!timestamp || !counterAndIndex) {
      throw new Ably.ErrorInfo('invalid timeserial', 50000, 500);
    }

    const [counter, index] = counterAndIndex.split(':');
    if (!counter) {
      throw new Ably.ErrorInfo('invalid timeserial', 50000, 500);
    }

    return new DefaultTimeserial(seriesId, Number(timestamp), Number(counter), index ? Number(index) : undefined);
  }

  /**
   * Compares this timeserial to the supplied timeserial, returning a number indicating their relative order.
   * @param timeserialToCompare The timeserial to compare against. Can be a string or a Timeserial object.
   * @returns 0 if the timeserials are equal, <0 if the first timeserial is less than the second, >0 if the first timeserial is greater than the second.
   * @throws {@link ErrorInfo} if comparison timeserial is invalid.
   */
  private _timeserialCompare(timeserialToCompare: string | Timeserial): number {
    const secondTimeserial =
      typeof timeserialToCompare === 'string'
        ? DefaultTimeserial.calculateTimeserial(timeserialToCompare)
        : timeserialToCompare;

    // Compare the timestamp
    const timestampDiff = this.timestamp - secondTimeserial.timestamp;
    if (timestampDiff) {
      return timestampDiff;
    }

    // Compare the counter
    const counterDiff = this.counter - secondTimeserial.counter;
    if (counterDiff) {
      return counterDiff;
    }

    // Compare the seriesId lexicographically
    const seriesIdDiff =
      this.seriesId === secondTimeserial.seriesId ? 0 : this.seriesId < secondTimeserial.seriesId ? -1 : 1;

    if (seriesIdDiff) {
      return seriesIdDiff;
    }

    // Compare the index, if present
    return this.index !== undefined && secondTimeserial.index !== undefined ? this.index - secondTimeserial.index : 0;
  }

  /**
   * Determines if this timeserial occurs logically before the given timeserial.
   *
   * @param timeserial The timeserial to compare against. Can be a string or a Timeserial object.
   * @returns true if this timeserial precedes the given timeserial, in global order.
   * @throws {@link ErrorInfo} if the given timeserial is invalid.
   */
  before(timeserial: Timeserial | string): boolean {
    return this._timeserialCompare(timeserial) < 0;
  }

  /**
   * Determines if this timeserial occurs logically after the given timeserial.
   *
   * @param timeserial The timeserial to compare against. Can be a string or a Timeserial object.
   * @returns true if this timeserial follows the given timeserial, in global order.
   * @throws {@link ErrorInfo} if the given timeserial is invalid.
   */
  after(timeserial: Timeserial | string): boolean {
    return this._timeserialCompare(timeserial) > 0;
  }

  /**
   * Determines if this timeserial is equal to the given timeserial.
   * @param timeserial The timeserial to compare against. Can be a string or a Timeserial object.
   * @returns true if this timeserial is equal to the given timeserial.
   * @throws {@link ErrorInfo} if the given timeserial is invalid.
   */
  equal(timeserial: Timeserial | string): boolean {
    return this._timeserialCompare(timeserial) === 0;
  }
}
