/**
 * The type for metadata contained in the operations field of a chat message.
 * This is a key-value pair where the key is a string, and the value is a string, it represents the metadata supplied
 * to a message update or deletion request.
 *
 * Do not use metadata for authoritative information. There is no server-side
 * validation. When reading the metadata, treat it like user input.
 *
 */
export type OperationMetadata = Record<string, string>;
