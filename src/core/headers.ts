/**
 * Headers are a flat key-value map that can be attached to chat messages.
 *
 * The headers are a flat key-value map and are sent as part of the realtime
 * message's extras inside the `headers` property. They can serve similar
 * purposes as Metadata, but as opposed to Metadata they are read by Ably and
 * can be used for features such as
 * [subscription filters](https://faqs.ably.com/subscription-filters).
 *
 * Do not use the headers for authoritative information. There is no
 * server-side validation. When reading the headers, treat them like user
 * input.
 *
 * If you need per-room authoritative information on messages, consider using
 * {@link Message.userClaim} via JWT user claims instead.
 *
 */
export type Headers = Record<string, number | string | boolean | null | undefined>;
