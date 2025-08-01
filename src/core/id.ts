/**
 * Generates a random string that can be used as an identifier, for instance, in identifying specific room
 * objects.
 * @returns A random string that can be used as an identifier.
 */
export const randomId = (): string => Math.random().toString(36).slice(2);
