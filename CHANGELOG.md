# Change Log

This contains only the most important and/or user-facing changes; for a full changelog, see the commit history.

## [0.2.0](https://github.com/ably/ably-chat-js/tree/0.2.0) (2024-09-09)

- Added hooks and providers for React, to allow a closer integration with these ecosystems. For more information on how to get started with Chat in React, see [the React README](./src/react/README.md).
- When a new room is returned from rooms.get() we now guarantee that the returned object is usable. Previously if the room was being released, the releasing room was returned. If needed, async operations wait for the previous release to finish behind-the-scenes.
- Added message parsing helpers that convert regular Ably Pub/Sub messages into Chat entities, which can be used on existing post-publish channel rules [#249](https://github.com/ably/ably-chat-js/pull/249).
- Improved documentation around getting previous messages for a given subscription [#328](https://github.com/ably/ably-chat-js/pull/328)
- The CDN bundle for the core Chat SDK is now in UMD format, as opposed to ESM. This will still work in both browsers and Node. The README instructions have been updated to reflect this [#333](https://github.com/ably/ably-chat-js/pull/333).

## [0.1.0](https://github.com/ably/ably-chat-js/tree/0.1.0) (2024-07-10)

- Initial private beta release of the Ably Chat SDK for JavaScript.
