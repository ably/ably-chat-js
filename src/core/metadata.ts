import { JsonObject } from './json.js';

/**
 * Metadata is a JSON-serializable object of extra information that can be attached to chat
 * messages. It is not used by Ably and is sent as part of the realtime
 * message payload. Example use cases are setting custom styling like
 * background or text colors or fonts, adding links to external images,
 * emojis, etc.
 *
 * Do not use metadata for authoritative information. There is no server-side
 * validation. When reading the metadata, treat it like user input.
 *
 * If you need per-room authoritative information on messages, consider using
 * {@link Message.userClaim} via JWT user claims instead.
 *
 */
export type Metadata = JsonObject;
