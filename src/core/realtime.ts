import * as Ably from 'ably';

/**
 * Convenience function that takes an event name and optional data and turns it into a
 * message that the server will recognize as ephemeral.
 *
 * @param name The name of the event.
 * @param data Optional data to send with the event.
 * @returns An Ably message.
 */
export const ephemeralMessage = (name: string, data?: unknown): Ably.Message => {
  return {
    name: name,
    data: data,
    extras: {
      ephemeral: true,
    },
  };
};
