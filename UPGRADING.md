# Upgrade Guide

This guide provides detailed instructions on how to upgrade between major versions of the Chat SDK.

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