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
  readonly createdBy: string;

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
   * @param message
   * @returns true if this message was created before the given message, in global order.
   */
  before(message: Message): boolean;

  /**
   * Determines if this message was created after the given message.
   * @param message
   * @returns true if this message was created after the given message, in global order.
   */
  after(message: Message): boolean;

  /**
   * Determines if this message is equal to the given message.
   * @param message
   * @returns true if this message is equal to the given message.
   */
  equal(message: Message): boolean;
}
