# Upgrade Guide

This guide provides detailed instructions on how to upgrade between major versions of the Chat SDK.

## 0.6.x to 0.7.x

### Room Options Restructuring

**Expected Impact: High**

Room options have been significantly restructured and are now an optional parameter when creating a room.
The `AllFeaturesEnabled` constant has been removed, and all features are now accessible regardless of the room options provided (this is related to the channel architecture change below).

Room options are now organized into categories:
- `typing` - Options for typing indicators
- `occupancy` - Options for room occupancy events
- `presence` - Options for presence events

Events for `presence` and `occupancy` can now be enabled or disabled through the `enableEvents` property of their respective options objects.

If no options for a particular feature are provided, the default options will be used. Please note:
- Occupancy events are disabled by default (`occupancy.enableEvents: false`)
- Presence events are enabled by default (`presence.enableEvents: true`)
- Typing indicators use a default heartbeat throttle of 10000ms

Previously:
```ts
const room = await chat.rooms.get('room-name', AllFeaturesEnabled);
```

Now:
```ts
// Using default options
const room = await chat.rooms.get('room-name');

// Or with custom options
const roomWithOptions = await chat.rooms.get('room-name', {
  occupancy: { enableEvents: true },
  typing: { heartbeatThrottleMs: 5000 },
});
```

### Typing Feature Changes

**Expected Impact: Medium**

#### Event Payload Changes

The typing event payload structure has changed::

1. The typing event payload now contains a `type` field and `change` field at the root level
2. The `change` field contains the single change that occurred, which is either `TypingEvents.Start` or `TypingEvents.Stop`, and the `clientId` of the user who started or stopped typing.

Before:
```ts
room.typing.subscribe((event) => {
  // event had no type field at root level
  const { currentlyTyping } = event;
});
```

After:
```ts
room.typing.subscribe((event) => {
  // event now has type and change fields
  const { type, change, currentlyTyping } = event;
  // type is TypingEvents.SetChanged
});
```

#### Typing API Changes

The typing method `start()` has been replaced with `keystroke()`. It should be used in the same way as before, calling it whenever a keystroke is made in the input field.
Also, repeated calls to `room.typing.keystroke()` will now be throttled to avoid sending too many events in quick succession. This can be configured using the `heartbeatThrottleMs` property in the `typing` options when creating a room.

Before:
```ts
room.typing.start();
```

After:
```ts
room.typing.keystroke();
```

### Message Reactions (experimental)

**Expected Impact: Low**

The `Message` class now contains a new field relating to experimental message reactions, and the `ChatMessageActions` enum now includes a new action type relating to message reactions.
It should not require any changes to your code, but may appear in logs or error messages that dump the message object.

### Discontinuity Listener Changes

**Expected Impact: Medium**

The `onDiscontinuity` listener is now only exposed at the room level, whereas before it was exposed in each feature.

Before:
```ts
// Subscribe to discontinuity events in each feature
room.typing.onDiscontinuity((discontinuity) => {
  console.error('Typing discontinuity:', discontinuity);
});

room.messages.onDiscontinuity((discontinuity) => {
  console.log('Messages discontinuity:', discontinuity);
});
```

After:
```ts
// Subscribe to discontinuity events at the room level
room.onDiscontinuity((discontinuity) => {
  console.log('Room discontinuity:', discontinuity);
});
```

This is because all features now share the same channel, so there is no need to subscribe to discontinuity events in each feature separately.

### Channel Architecture Change

**Expected Impact: High**

The SDK has moved from a multi-channel to a single-channel architecture underpinned by a new channel (`*::$chat`).
This has two major effects:
1. The new channel is now the only channel used for all features. Thus, this version of the SDK is not compatible with any previous versions of the Ably Chat SDK. 
2. You should no longer express capabilities for channels and REST access separately when creating token requests.

Before:
```ts
const tokenRequestData = await client.auth.createTokenRequest({
  capability: {
    // REST access
    '[chat]my-room': ['PUBLISH'],
    // Channel access for each feature
    "my-room::$chat::$chatMessages": ["publish", "subscribe", "history"],
    "my-room::$chat::$typingIndicators": ["subscribe", "presence"],
    "my-room::$chat::$roomReactions": ["subscribe", "publish"]
  },
  clientId: 'my-client-id',
});
```

After:
```ts
const tokenRequestData = await client.auth.createTokenRequest({
  capability: {
    // Single capability definition for both REST and Channel access
    '[chat]my-room': ['PUBLISH'],
  },
  clientId: 'my-client-id',
});
```

The `[chat]` qualifier now represents both the REST and Channel access for the new single `my-room::$chat` channel.


## 0.5.x to 0.6.x

### React Package Move

**Expected Impact: High**

Our react APIs (react hooks, context providers, etc) have been moved to a subpath export of the main `@ably/chat` package. This means that you should now import them from `@ably/chat/react` instead of `@ably/chat`.

This change improves overall developer experience, as it allows for better tree-shaking and avoids build issues for projects not using react.

## 0.4.0 to 0.5.0

### Message Version Comparison Methods

**Expected Impact: Medium**

The message version comparison methods `versionBefore`, `versionAfter` and `versionEqual` have been renamed to `isOlderVersionOf`, `isNewerVersionOf` and `isSameVersionAs` respectively.

These methods no longer throw an error if two distinct messages are compared, instead returning false.

### Room Options Renaming

**Expected Impact: Low**

The field `RoomOptionsDefault` has been renamed to `AllFeaturesEnabled`. Please update any references to this in your code.

### Client Options Renaming

**Expected Impact: Low**

The type `ClientOptions` has been renamed to `ChatClientOptions`. Please update any references to this in your code.

### Message Event Type Renaming

**Expected Impact: Low**

The type `MessageEventPayload` has been renamed to `MessageEvent`. Please update any references to this in your code.

## <= 0.3.1 to 0.4.0

### React Package Removed

**Expected Impact: High**

The `@ably/chat/react` and `@ably/chat/react-native` packages have been removed. All React imports are in the base `@ably/chat` package.

#### React

Before:

```ts
import { Message } from '@ably/chat';
import { useMessages } from '@ably/chat/react';
```

After:

```ts
import { Message, useMessages } from '@ably/chat';
```

#### React Native

Before:

```ts
import { Message } from '@ably/chat';
import { useMessages } from '@ably/chat-react-native';
```

After:

```ts
import { Message, useMessages } from '@ably/chat';
```

## <= 0.2.1 to 0.3.0

### Room and Connection Status Types

**Expected Impact: High**

These have been renamed for greater clarity. The key changes are that the `RoomStatus` and `ConnectionStatus` identifiers are now enumerations of the possible statuses, whereas before they were an interface name. Furthermore, the current status is now presented as the property `status`, rather than the property `current`.

| Action                                                   | Before                                               | After                                             |
| -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Get the “current” status of a room                       | `room.status.current`                                | `room.status`                                     |
| Get the “current” error related to the room status       | `room.status.error`                                  | `room.error`                                      |
| Subscribe to room status updates                         | `room.status.onChange`                               | `room.onStatusChange`                             |
| Remove all room status subscribers                       | `room.status.offAll`                                 | `room.offAllStatusChange`                         |
| Compare the room status to some value                    | `roomStatus === RoomLifecycle.Attached`              | `roomStatus === RoomStatus.Attached`              |
| Get the “current” connection status                      | `chat.connection.status.current`                     | `chat.connection.status`                          |
| Get the “current” error related to the connection status | `chat.connection.status.error`                       | `chat.connection.error`                           |
| Subscribe to connection status updates                   | `chat.connection.status.onChange`                    | `chat.connection.onStatusChange`                  |
| Remove all connection status subscribers                 | `chat.connection.status.offAll`                      | `chat.connection.offAllStatusChange`              |
| Compare the connection status to some value              | `connectionStatus === ConnectionLifecycle.Connected` | `connectionStatus === ConnectionStatus.Connected` |

### Creating a Room Is Now Asynchronous

**Expected Impact: High**

The `Rooms.get` method is now asynchronous, returning a `Promise` which will resolve when the `Room` object is ready. If a `release` operation is in progress for the room, it shall wait for this
process to complete before resolving.

Before:

```ts
const room = chat.rooms.get('basketball-stream', { typing: { timeoutMs: 500 } });
```

After:

```ts
const room = await chat.rooms.get('basketball-stream', { typing: { timeoutMs: 500 } });
```

As a result, the `channel` property of various features (e.g. `messages.channel`) now returns an `Ably.RealtimeChannel` rather than a `Promise`.

### Default Room Status

**Expected Impact: Medium**

The default status of a newly created room is now `Initialized`. It was previously `Initializing`. `Initializing` is still used in React when the room is not yet resolved.

### Message Timeserial Field Rename

**Expected Impact: Medium**

This field has been renamed, so all occurrences of `message.timeserial` should now be changed to `message.serial`.

If you wish to, messages may now be compared for global ordering by comparing their `serial` strings.

```ts
const message1First = message1.serial < message2.serial;
```

The `before` and `after` methods are still available and will be kept for simplicity and autocomplete convenience.

### History Direction Parameter Removed

**Expected Impact: Medium**

The `direction` argument to message history has been replaced by `orderBy`, which uses a new enum `OrderBy` with values `OldestFirst` and `NewestFirst`. Its behavior is identical to `direction: forwards | backwards`.

Before:

```ts
const historicalMessages = await room.messages.get({ direction: 'backwards', limit: 50 });
```

After:

```ts
const historicalMessages = await room.messages.get({ orderBy: OrderBy.NewestFirst, limit: 50 });
```

### React Hooks Room Property Values

**Expected Impact: Low**

In previous versions of React Hooks, properties of the Room (e.g. `room.messages`) and the room itself were returned as `ValueType`. These are now returned as `ValueType | undefined`.

The value will be updated once the internal call to `Rooms.get()` has resolved.

### Typing Timeout

**Expected Impact: Low**

The default is now 5 seconds.

If you wish to retain the old behavior, change your `RoomOptions` when creating a `Room` as follows:

```ts
const room = await chat.rooms.get('basketball-stream', { typing: { timeoutMs: 500 } });
```
