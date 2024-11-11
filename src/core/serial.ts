import * as Ably from 'ably';

/**
 * Represents a parsed serial.
 */
export interface Serial {
  /**
   * The series ID of the serial.
   */
  readonly seriesId: string;

  /**
   * The timestamp of the serial.
   */
  readonly timestamp: number;

  /**
   * The counter of the serial.
   */
  readonly counter: number;

  /**
   * The index of the serial.
   */
  readonly index?: number;

  toString(): string;

  before(serial: Serial | string): boolean;

  after(serial: Serial | string): boolean;

  equal(serial: Serial | string): boolean;
}

/**
 * Default implementation of the Serial interface. Used internally to parse and compare serials.
 *
 * @internal
 */
export class DefaultSerial implements Serial {
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
   * Returns the string representation of the serial object.
   * @returns The serial string.
   */
  toString(): string {
    return `${this.seriesId}@${this.timestamp.toString()}-${this.counter.toString()}${this.index ? `:${this.index.toString()}` : ''}`;
  }

  /**
   * Calculate the serial object from a serial string.
   *
   * @param serial The serial string to parse.
   * @returns The parsed serial object.
   * @throws {@link ErrorInfo} if serial is invalid.
   */
  public static calculateSerial(serial: string): Serial {
    const [seriesId, rest] = serial.split('@');
    if (!seriesId || !rest) {
      throw new Ably.ErrorInfo('invalid serial', 50000, 500);
    }

    const [timestamp, counterAndIndex] = rest.split('-');
    if (!timestamp || !counterAndIndex) {
      throw new Ably.ErrorInfo('invalid serial', 50000, 500);
    }

    const [counter, index] = counterAndIndex.split(':');
    if (!counter) {
      throw new Ably.ErrorInfo('invalid serial', 50000, 500);
    }

    return new DefaultSerial(seriesId, Number(timestamp), Number(counter), index ? Number(index) : undefined);
  }

  /**
   * Compares this serial to the supplied serial, returning a number indicating their relative order.
   * @param serialToCompare The serial to compare against. Can be a string or a Serial object.
   * @returns 0 if the serials are equal, <0 if the first serial is less than the second, >0 if the first serial is greater than the second.
   * @throws {@link ErrorInfo} if comparison serial is invalid.
   */
  private _serialCompare(serialToCompare: string | Serial): number {
    const secondSerial =
      typeof serialToCompare === 'string' ? DefaultSerial.calculateSerial(serialToCompare) : serialToCompare;

    // Compare the timestamp
    const timestampDiff = this.timestamp - secondSerial.timestamp;
    if (timestampDiff) {
      return timestampDiff;
    }

    // Compare the counter
    const counterDiff = this.counter - secondSerial.counter;
    if (counterDiff) {
      return counterDiff;
    }

    // Compare the seriesId lexicographically
    const seriesIdDiff = this.seriesId === secondSerial.seriesId ? 0 : this.seriesId < secondSerial.seriesId ? -1 : 1;

    if (seriesIdDiff) {
      return seriesIdDiff;
    }

    // Compare the index, if present
    return this.index !== undefined && secondSerial.index !== undefined ? this.index - secondSerial.index : 0;
  }

  /**
   * Determines if this serial occurs logically before the given serial.
   *
   * @param serial The serial to compare against. Can be a string or a Serial object.
   * @returns true if this serial precedes the given serial, in global order.
   * @throws {@link ErrorInfo} if the given serial is invalid.
   */
  before(serial: Serial | string): boolean {
    return this._serialCompare(serial) < 0;
  }

  /**
   * Determines if this serial occurs logically after the given serial.
   *
   * @param serial The serial to compare against. Can be a string or a Serial object.
   * @returns true if this serial follows the given serial, in global order.
   * @throws {@link ErrorInfo} if the given serial is invalid.
   */
  after(serial: Serial | string): boolean {
    return this._serialCompare(serial) > 0;
  }

  /**
   * Determines if this serial is equal to the given serial.
   * @param serial The serial to compare against. Can be a string or a Serial object.
   * @returns true if this serial is equal to the given serial.
   * @throws {@link ErrorInfo} if the given serial is invalid.
   */
  equal(serial: Serial | string): boolean {
    return this._serialCompare(serial) === 0;
  }
}
