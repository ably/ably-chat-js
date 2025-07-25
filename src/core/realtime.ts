import * as Ably from 'ably';

/**
 * Convenience function that takes an event name and optional data and turns it into a
 * message that the server will recognize as ephemeral.
 * @param name The name of the event.
 * @param data Optional data to send with the event.
 * @returns An Ably message.
 */
export const ephemeralMessage = (name: string, data?: unknown): Ably.Message => ({
  name: name,
  data: data,
  extras: {
    ephemeral: true,
  },
});

/**
 * Takes an existing Ably message and converts it to an ephemeral message by adding
 * the ephemeral flag in the extras field.
 * @param message The Ably message to convert.
 * @returns A new Ably message with the ephemeral flag set.
 */
export const messageToEphemeral = (message: Ably.Message): Ably.Message => {
  const extras = message.extras ? (message.extras as object) : {};

  return {
    ...message,
    extras: {
      ...extras,
      ephemeral: true,
    },
  };
};
