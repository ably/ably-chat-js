# Change Log

This contains only the most important and/or user-facing changes; for a full changelog, see the commit history.

## [1.2.0](https://github.com/ably/ably-chat-js/tree/1.2.0) (2026-02-24)

### New Features

- **User Claims**: Exposed `userClaim` as an optional string field on chat messages, presence events, typing events, room reactions, and message reactions. This allows customers to use channel-specific JWT user claims with Chat. [#711](https://github.com/ably/ably-chat-js/pull/711)
- **Typing Indicators**: Added `currentTypers` to `TypingSetEvent` and `Typing` interface, providing a `TypingMember[]` with `clientId` and `userClaim` for each currently typing user. The existing `currentlyTyping` (`Set<string>`) and `current` getter are deprecated in favour of `currentTypers`. [#711](https://github.com/ably/ably-chat-js/pull/711)

## [1.1.1](https://github.com/ably/ably-chat-js/tree/1.1.1) (2025-11-14)

### Changes

- **TypeDocs**: Expanded TypeDoc coverage to include example usage.

## [1.1.0](https://github.com/ably/ably-chat-js/tree/1.1.0) (2025-10-30)

### Bug Fixes

- **Connection Status**: Added missing `closing` and `closed` states to the `ConnectionStatus` enum. Previously these states were incorrectly mapped to `failed`. [#687](https://github.com/ably/ably-chat-js/pull/687)

## [1.0.0](https://github.com/ably/ably-chat-js/tree/1.0.0) (2025-10-22)

We are excited to announce that the Ably Chat SDK API is now stable.

The Chat SDK includes comprehensive support for:

- Chat rooms for 1:1, 1:many, many:1 and many:many participation
- Messages with full CRUD operations (create, read, update, delete)
- Presence to track online status of chat participants
- Occupancy for monitoring total connections and presence members
- Typing indicators for real-time typing awareness
- Room reactions for real-time room reactions
- Message reactions for reactions to specific messages
- Hooks for direct integrations into React applications.

We are committed to maintaining API stability and providing long-term support for v1.x releases.

Thank you to everyone who provided feedback during the preview releases!

## [0.15.0](https://github.com/ably/ably-chat-js/tree/0.15.0) (2025-10-20)

### Breaking Changes

This release contains significant API changes to improve consistency and type safety. Please see `UPGRADING.md` for full guidance on upgrading from version 0.14.x.

- **Typing and Occupancy API**: Changed `current()` methods to properties for consistency with other SDK APIs. [#682](https://github.com/ably/ably-chat-js/pull/682)
- **Message API Simplification**: Removed convenience comparison methods (`before()`, `after()`, `equal()`, etc.) from Message type. [#676](https://github.com/ably/ably-chat-js/pull/676)
- **Presence Event Filtering**: Removed event filter parameter from presence subscription for API consistency. [#675](https://github.com/ably/ably-chat-js/pull/675)
- **Message Serial Parameters**: Serial parameters in method signatures must now be strings instead of objects. [#674](https://github.com/ably/ably-chat-js/pull/674)
- **Message Reaction Events**: Restructured summary events - renamed `summary` to `reactions` and lifted `messageSerial` to top level. [#670](https://github.com/ably/ably-chat-js/pull/670)
- **Type Renaming**: Multiple type renames for clarity:
  - `QueryOptions` → `HistoryParams` [#657](https://github.com/ably/ably-chat-js/pull/657)
  - `MessageOptions` → `MessagesOptions` [#659](https://github.com/ably/ably-chat-js/pull/659)
  - `MessagesReactions` → `MessageReactions` [#663](https://github.com/ably/ably-chat-js/pull/663)
  - `MessageReactions` → `MessageReactionSummary` [#663](https://github.com/ably/ably-chat-js/pull/663)
- **Event Type Changes**: Split `MessageReactionEventType` into separate types for summary and raw events. [#660](https://github.com/ably/ably-chat-js/pull/660)
- **Type Safety Improvements**:
  - `PresenceMember.extras` type tightened from `any` to `JsonObject` [#668](https://github.com/ably/ably-chat-js/pull/668)
  - Metadata types now enforce JSON-serializable [#658](https://github.com/ably/ably-chat-js/pull/658)
  - `ChatClient.clientId` is now optional to match specification [#655](https://github.com/ably/ably-chat-js/pull/655)
  - `Message.version.serial` and `Message.version.timestamp` are now non-nullable [#646](https://github.com/ably/ably-chat-js/pull/646)
- **Internal API Changes**:
  - Removed `clientOptions` from Rooms interface [#661](https://github.com/ably/ably-chat-js/pull/661)
  - Moved `Rooms.count` to internal interface [#666](https://github.com/ably/ably-chat-js/pull/666)
  - Removed redundant enum members from `ChatMessageAction` [#677](https://github.com/ably/ably-chat-js/pull/677)

### Fixes

- **Serial Validation**: Re-introduced checks to ensure serial is not empty string, null, or undefined. [#680](https://github.com/ably/ably-chat-js/pull/680)
- **Promise Handling**: Made promise-returning methods properly async to ensure exceptions return rejected promises. [#678](https://github.com/ably/ably-chat-js/pull/678)

### Improvements

- **Error Messages**: Standardized error message format across core and React packages to "unable to <op>; <reason>". [#678](https://github.com/ably/ably-chat-js/pull/678)
- **Error Codes**: Introduced specific error codes to replace generic 40000 and 50000 codes for better developer experience. [#672](https://github.com/ably/ably-chat-js/pull/672)
- **Dependencies**: Bumped ably-js to 2.14.0 with proper parsing of clipped flag. [#664](https://github.com/ably/ably-chat-js/pull/664)

## [0.14.1](https://github.com/ably/ably-chat-js/tree/0.14.1) (2025-10-02)

### Fixes

- **Message Versioning**: Made `version.serial` and `version.timestamp` non-nullable for better type safety. [#646](https://github.com/ably/ably-chat-js/pull/646)
- **React Agent String**: Fixed agent string to include JavaScript SDK version when using React hooks. [#647](https://github.com/ably/ably-chat-js/pull/647)

### API Changes

- **Connection API**: Removed internal `dispose` method from public Connection API. [#645](https://github.com/ably/ably-chat-js/pull/645)

## [0.14.0](https://github.com/ably/ably-chat-js/tree/0.14.0) (2025-09-29)

### Breaking Changes

- **Presence Data Type**: Updated `PresenceData` to be a JSON object for better serialization compatibility. [#642](https://github.com/ably/ably-chat-js/pull/642)

### Improvements

- **Message API Updates**: Updated message API responses to introduce meaningful nesting to message versioning. [#620](https://github.com/ably/ably-chat-js/pull/620)

## [0.13.0](https://github.com/ably/ably-chat-js/tree/0.13.0) (2025-09-17)

### New Features

- **Client Message Reactions Fetching**: Added method to fetch a client's reactions ("my reactions") in preparation for clipping at large scale. [#626](https://github.com/ably/ably-chat-js/pull/626)

### Improvements

- **usePresence Hook Refactor**: Improved auto-enter/leave behavior and documentation for better presence management in React applications. [#633](https://github.com/ably/ably-chat-js/pull/633)
- **React Hook Simplification**: Removed core SDK instances from React hooks return values for cleaner API surface. [#637](https://github.com/ably/ably-chat-js/pull/637)
- **useChatClient Hook Reactive clientId**: The `useChatClient` React hook's `clientId` property is now reactive to changes in the underlying Realtime client. [#638](https://github.com/ably/ably-chat-js/pull/638)

### Documentation

- **usePresence Hook Usage Guidance**: Added comprehensive examples and guidance for the usePresence hook. [#633](https://github.com/ably/ably-chat-js/pull/633)

## [0.12.0](https://github.com/ably/ably-chat-js/tree/0.12.0) (2025-09-08)

### New Features

- **Single Message Fetching**: Added `messages.get(serial)` method to fetch a single message by its serial identifier, available in both core SDK and React `useMessages` hook. [#607](https://github.com/ably/ably-chat-js/pull/607)
- **usePresence Manual Control**: Added `autoEnterLeave` parameter to the `usePresence` React hook for optional control over automatic presence entry/exit, with exposed manual `enter` and `leave` methods for fine-grained control. [#621](https://github.com/ably/ably-chat-js/pull/621)
- **Resource Disposal Methods**: Added async `dispose()` method to the chat client for improved resource cleanup and automatic room release management. [#601](https://github.com/ably/ably-chat-js/pull/601)

### Fixes

- **Presence Re-entry Handling**: Fixed handling of presence auto re-entry failures to ensure accurate `isPresent` state in React hooks and prevent race conditions. [#602](https://github.com/ably/ably-chat-js/pull/602)

## [0.11.0](https://github.com/ably/ably-chat-js/tree/0.11.0) (2025-01-23)

### Breaking Changes

This release contains breaking API changes. Please see `UPGRADING.md` for full guidance on upgrading from version 0.10.0.

- **useMessages Helpers Rename**: Renamed `send()` to `sendMessage()`, `send()` to `sendRoomReaction()` and `update()` to `updateMessage()` in the `useMessages` hook for clarity. [#595](https://github.com/ably/ably-chat-js/pull/595)
- **useRoomReactions Helpers Rename**: Renamed `send()` to `sendRoomReaction()` in the `useRoomReactions` hook for clarity. [#595](https://github.com/ably/ably-chat-js/pull/595)
- **Message Reactions Method Rename**: Renamed `add()` to `send()` in the Message Reactions interface. [#603](https://github.com/ably/ably-chat-js/pull/603)
- **Typing Event Enum**: Renamed `TypingEventType` values to match to `Started` and `Stopped`. [#599](https://github.com/ably/ably-chat-js/pull/599)
- **Presence Data Structure**: Updated presence member structure to include `connectionId` and changed `updatedAt` to use Date type. [#600](https://github.com/ably/ably-chat-js/pull/600)

### Improvements

- **React Room Management**: Improved room management in React via reference counting for better resource management. [#572](https://github.com/ably/ably-chat-js/pull/572)
- **Logging**: Added random identifier to chat client logging context for better debugging. [#609](https://github.com/ably/ably-chat-js/pull/609)

## [0.10.0](https://github.com/ably/ably-chat-js/tree/0.10.0) (2025-01-08)

### Breaking Changes

This release contains breaking API changes. Please see `UPGRADING.md` for full guidance on upgrading from version 0.9.0.

- **Room Reaction Interface**: Renamed `Reaction` to `RoomReaction` to disambiguate against message reactions. [#594](https://github.com/ably/ably-chat-js/pull/594)
- **Room Reaction Wire Protocol**: Changed `type` to `name` in the Room Reactions wire protocol. [#575](https://github.com/ably/ably-chat-js/pull/575)

### Fixes

- **Deleted Messages**: Improved message parsing to handle delete actions with empty values correctly. [#583](https://github.com/ably/ably-chat-js/pull/583)
- **Room Reactions**: Send reaction type (short-form) instead of annotation type (long-form) to chat HTTP endpoints for improved performance. [#593](https://github.com/ably/ably-chat-js/pull/593)

### Misc

- Improved logging on failed tests for better debugging. [#591](https://github.com/ably/ably-chat-js/pull/591)
- Documentation link corrections. [#596](https://github.com/ably/ably-chat-js/pull/596)

## [0.9.0](https://github.com/ably/ably-chat-js/tree/0.9.0) (2025-06-30)

### Breaking Changes

This release contains breaking API changes. Please see `UPGRADING.md` for full guidance on upgrading from version 0.8.0.

- **Reaction Interface**: Renamed `type` to `name` in the `Reaction` interface for consistency. [#574](https://github.com/ably/ably-chat-js/pull/574)
- **Room Reactions**: Renamed `type` to `name` in `SendReactionParams` for sending room reactions. [#577](https://github.com/ably/ably-chat-js/pull/577)

### Fixes

- Fixed React Native/Expo compatibility by replacing `structuredClone` with lodash `cloneDeep`. [#573](https://github.com/ably/ably-chat-js/pull/573)

### Misc

- Improved README with better structure, shields, and documentation. [#557](https://github.com/ably/ably-chat-js/pull/557)

## [0.8.0](https://github.com/ably/ably-chat-js/tree/0.8.0)(2025-06-05)

### Breaking Changes

This release is a tidy-up and improvement of the API and thus contains breaking changes. Please see `UPGRADING.md` for full guidance on upgrading from version 0.7.0.

- Review of the API [#550](https://github.com/ably/ably-chat-js/pull/550)

### Fixes

- MessageReactionEvents enum is now exported as a value, not type [#551](https://github.com/ably/ably-chat-js/pull/551)
- Fixed unexpected React unmounts caused by the `useMessages` hook not using stable references for message reactions listeners [#566](https://github.com/ably/ably-chat-js/pull/566)

### Misc

- The library is now tested against Node 24 [#553](https://github.com/ably/ably-chat-js/pull/553)

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
