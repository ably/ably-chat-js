/**
 * Metadata is a map of extra information that can be attached to chat
 * messages. It is not used by Ably and is sent as part of the realtime
 * message payload. Example use cases are setting custom styling like
 * background or text colors or fonts, adding links to external images,
 * emojis, etc.
 *
 * Do not use metadata for authoritative information. There is no server-side
 * validation. When reading the metadata, treat it like user input.
 *
 */
export type Metadata = Record<string, unknown>;
