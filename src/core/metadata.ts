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

/**
 * The type for metadata contained in the {@link updateDetail} and {@link deletionDetail} fields of a chat message.
 * This is a key-value pair where the key is a string, and the value is a string, it represents the metadata supplied
 * to a message update or deletion request.
 *
 * Do not use metadata for authoritative information. There is no server-side
 * validation. When reading the metadata, treat it like user input.
 *
 * The key `ably-chat` is reserved and cannot be used. Ably may populate
 * this with different values in the future.
 */
export type DetailsMetadata = Record<string, string>;
