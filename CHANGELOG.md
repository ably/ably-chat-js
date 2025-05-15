# Change Log

This contains only the most important and/or user-facing changes; for a full changelog, see the commit history.

## [0.7.0](https://github.com/ably/ably-chat-js/tree/0.7.0) (2025-05-15)

### Breaking Changes

This release contains breaking API changes. Please see `UPGRADING.md` for full guidance on upgrading from version 0.6.0.

- **Channel Architecture Change**: Moved from a multi-channel to a single-channel architecture, simplifying internal logic and capability definitions. [#521](https://github.com/ably/ably-chat-js/pull/521)
- **Room Options Restructuring**: Room options are now optional and organized into (`typing`, `occupancy`, `presence` and `messages`). The `AllFeaturesEnabled` constant has been removed. [#521](https://github.com/ably/ably-chat-js/pull/521)
- **Typing Feature Changes**: Changed the typing event payload structure and replaced `typing.start()` with `typing.keystroke()`. [#524](https://github.com/ably/ably-chat-js/pull/524)
- **Discontinuity Listener Changes**: The `onDiscontinuity` listener is now only exposed at the room level, whereas before it was exposed in each feature. [#521](https://github.com/ably/ably-chat-js/pull/521)

### New Features

- **Message Reactions**: Added *experimental* support for message reactions. [#473](https://github.com/ably/ably-chat-js/pull/473)


## [0.6.0](https://github.com/ably/ably-chat-js/tree/0.6.0) (2025-04-17)

- build: move react to subpath export, add react-native workaround [#525](https://github.com/ably/ably-chat-js/pull/525)
- fix: in the case that the same listener is subscribed more than once, calling `unsubscribe` only removes it once [#518](https://github.com/ably/ably-chat-js/pull/518)
- docs: Update README Chat install section [#517](https://github.com/ably/ably-chat-js/pull/517)

## [0.5.1](https://github.com/ably/ably-chat-js/tree/0.5.1) (2025-03-17)

### Fixes

- The `OrderBy` enum is now exported in full, instead of just a type definition. [#503](https://github.com/ably/ably-chat-js/pull/503)

## [0.5.0](https://github.com/ably/ably-chat-js/tree/0.5.0) (2025-03-13)

### Breaking Changes

This release contains minor breaking API changes. Please see `UPGRADING.md` for full guidance on upgrading from version 0.4.0.

### New Features

- Added a new method, `Message.with`, a helper for returning updated messages after edit and delete events. [#457](https://github.com/ably/ably-chat-js/pull/457)
- Renamed `RoomOptionsDefault` to `AllFeaturesEnabled` [#478](https://github.com/ably/ably-chat-js/pull/478)
- Renamed `ClientOptions` type to `ChatClientOptions` [#478](https://github.com/ably/ably-chat-js/pull/478)
- Added a getting started guide in the README [#477](https://github.com/ably/ably-chat-js/pull/477)
- Renamed the message version comparison methods. [#479](https://github.com/ably/ably-chat-js/pull/479)
- Renamed `MessageEventPayload` type to `MessageEvent` [#488](https://github.com/ably/ably-chat-js/pull/488)
- Added a `copy` method to `Message` and updated the signature of `messages.update` [#497](https://github.com/ably/ably-chat-js/pull/497)

### Removals

- Removed public realtime message parsing functions [#475](https://github.com/ably/ably-chat-js/pull/475).


## [0.4.0](https://github.com/ably/ably-chat-js/tree/0.4.0) (2025-01-20)

### Breaking Changes

Please see `UPGRADING.md` for full guidance on upgrading from version 0.3.1 and before.

- The `@ably/chat/react` and `@ably/chat/react-native` packages have been removed. All React imports are in the base `@ably/chat` package.

## [0.3.1](https://github.com/ably/ably-chat-js/tree/0.3.1) (2025-01-14)

### Fixes

There are no API changes, but this release is required to support a change in the underlying message attributes.

- Upgraded the `package.json` dependency of `ably-js` to v2.6.2 [#449](https://github.com/ably/ably-chat-js/pull/449)

## [0.3.0](https://github.com/ably/ably-chat-js/tree/0.3.0) (2025-01-06)

### Breaking Changes

Please see `UPGRADING.md` for full guidance on upgrading from version 0.2.1 and before.

- The default typing timeout has now been reduced to 5 seconds. [#361](https://github.com/ably/ably-chat-js/pull/361)
- Room and Connection status types have been renamed. [#382](https://github.com/ably/ably-chat-js/pull/382)
- Renamed the `timeserial` field on the `Message` type to `serial`. Messages may now be compared for global order by string comparison of this field.
- `Rooms.get` is now asynchronous and returns a `Promise` that will resolve once any `release` operations on the room are complete. [#387](https://github.com/ably/ably-chat-js/pull/387).
- The `Room.channel` property is now an instance of `Ably.RealtimeChannel`, rather than a `Promise`. [#387](https://github.com/ably/ably-chat-js/pull/387)
- In React, accessing the room via `useRoom`, or properties of the room via other hooks, now returns `ValueType | undefined`. Once the room's promise is resolved (see above), this will update to the actual value. [#387](https://github.com/ably/ably-chat-js/pull/387)
- The default Room status is now `Initialized`. The `Initializing` status is retained for use in React when the room has not yet been resolved. [#387](https://github.com/ably/ably-chat-js/pull/387)
- The `direction` argument to message history has been replaced by `orderBy`, which uses a new enum `OrderBy` with values `OldestFirst` and `NewestFirst`. Its behavior is identical to `direction: forwards | backwards`.

### New Features

- Added new fields to Messages to support editing and deleting. [#362](https://github.com/ably/ably-chat-js/pull/362)
- Added the ability to delete messages in the chat. [#365](https://github.com/ably/ably-chat-js/pull/365)
- Added the ability to edit messages in the chat. [#378](https://github.com/ably/ably-chat-js/pull/378)

### Fixed Bugs

- The Room will now transition immediately to `released` if `release` is called whilst its status is `Initialized`. [#400](https://github.com/ably/ably-chat-js/pull/400)
- When paginating messages (e.g. via `getPreviousMessages`) the objects returned by successive pages will now fully implement the `Message` interface. Previously they were simple JSON objects after the first page. [#403](https://github.com/ably/ably-chat-js/pull/403).
- Fixed a bug whereby a room may get stuck in the `Suspended` status after network issues. [#409](https://github.com/ably/ably-chat-js/pull/409)

### Other Changes

- `ably-chat` is no longer a reserved key on Message and Reaction metadata/headers. [#374](https://github.com/ably/ably-chat-js/pull/374)

## [0.2.1](https://github.com/ably/ably-chat-js/tree/0.2.1) (2024-09-18)

- Fixed a bug that can lead to unhandled promise rejections and error logs when a room is released prior to initialization, particularly in React [#352](https://github.com/ably/ably-chat-js/pull/352)

## [0.2.0](https://github.com/ably/ably-chat-js/tree/0.2.0) (2024-09-09)

- Added hooks and providers for React, to allow a closer integration with these ecosystems. For more information on how to get started with Chat in React, see [the React README](./src/react/README.md).
- When a new room is returned from rooms.get() we now guarantee that the returned object is usable. Previously if the room was being released, the releasing room was returned. If needed, async operations wait for the previous release to finish behind-the-scenes.
- Added message parsing helpers that convert regular Ably Pub/Sub messages into Chat entities, which can be used on existing post-publish channel rules [#249](https://github.com/ably/ably-chat-js/pull/249).
- Improved documentation around getting previous messages for a given subscription [#328](https://github.com/ably/ably-chat-js/pull/328)
- The CDN bundle for the core Chat SDK is now in UMD format, as opposed to ESM. This will still work in both browsers and Node. The README instructions have been updated to reflect this [#333](https://github.com/ably/ably-chat-js/pull/333).

## [0.1.0](https://github.com/ably/ably-chat-js/tree/0.1.0) (2024-07-10)

- Initial private beta release of the Ably Chat SDK for JavaScript.
