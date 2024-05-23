import { Message } from './entities.js';

interface Timeserial {
  seriesId: string;
  timestamp: number;
  counter: number;
  index?: number;
}

export class ChatMessage implements Message {
  private readonly calculatedTimeserial: Timeserial;

  constructor(
    public timeserial: string,
    public createdBy: string,
    public roomId: string,
    public content: string,
    public createdAt: number,
  ) {
    this.calculatedTimeserial = ChatMessage.calculateTimeserial(timeserial);
  }

  before(message: ChatMessage): boolean {
    ChatMessage.assertMessageIsChatMessage(message);
    return ChatMessage.timeserialCompare(this, message) < 0;
  }

  after(message: ChatMessage): boolean {
    ChatMessage.assertMessageIsChatMessage(message);
    return ChatMessage.timeserialCompare(this, message) > 0;
  }

  equal(message: ChatMessage): boolean {
    ChatMessage.assertMessageIsChatMessage(message);
    return ChatMessage.timeserialCompare(this, message) === 0;
  }

  private static assertMessageIsChatMessage(message: Message): ChatMessage {
    if (!(message instanceof ChatMessage)) {
      throw new Error('Message for comparison is not a ChatMessage');
    }

    return message;
  }

  /**
   * Compares two timeserials and returns a number indicating their order.
   *
   * 0 if the timeserials are equal.
   * <0 if the first timeserial is less than the second.
   * >0 if the first timeserial is greater than the second.
   */
  private static timeserialCompare(first: ChatMessage, second: ChatMessage): number {
    const firstTimeserial = first.calculatedTimeserial;
    const secondTimeserial = second.calculatedTimeserial;

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
