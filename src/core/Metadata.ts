/**
 * Metadata is a map of extra information that can be attached to chat
 * messages. It is not used by Ably and is sent as part of the realtime
 * message payload. Example use cases are setting custom styling like
 * background or text colors or fonts, adding links to external images,
 * emojis, etc.
 *
 * Do not use metadata for authoritative information. There is no server-side
 * validation. When reading the metadata treat it like user input.
 *
 * The key `ably-chat` is reserved and cannot be used. Ably may populate
 * this with different values in the future.
 */
export type Metadata = Record<string, unknown>;
