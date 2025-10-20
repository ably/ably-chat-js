# Upgrade Guide

This guide provides detailed instructions on how to upgrade between major versions of the Chat SDK.

## 0.14.x to 0.15.0

### Typing and Occupancy Current Changed to Properties

**Expected Impact: Low**

The `current()` methods have been changed to properties for consistency with other parts of the API (e.g., room status).

**Before**

```ts
const typingInfo = typing.current();
const occupancyInfo = occupancy.current();
```

**After**

```ts
const typingInfo = typing.current;
const occupancyInfo = occupancy.current;
```

### Message Convenience Methods Removed

**Expected Impact: Medium**

Convenience comparison methods have been removed from the `Message` type. Use direct string comparisons of the `serial` and `version.serial` properties instead.

**Before**

```ts
if (message1.before(message2)) {
  // message1 is before message2
}

if (message1.equal(message2)) {
  // same message
}

if (message1.versionBefore(message2)) {
  // message1 version is older
}
```

**After**

```ts
// Direct comparison using serial strings
if (message1.serial < message2.serial) {
  // message1 is before message2
}

if (message1.serial === message2.serial) {
  // same message
}

// For version comparison
if (message1.version.serial < message2.version.serial) {
  // message1 version is older
}
```

### Presence Event Filter Removed

**Expected Impact: Medium**

Event filtering on presence subscription has been removed. Use if/switch statements for event filtering instead.

**Before**

```ts
presence.subscribe('enter', (event) => {
  console.log('User entered:', event.member.clientId);
});

presence.subscribe(['enter', 'leave'], (event) => {
  console.log('User presence changed:', event.type);
});
```

**After**

```ts
import { PresenceEventType } from '@ably/chat';
presence.subscribe((event) => {
  if (event.type === PresenceEventType.Enter) {
    console.log('User entered:', event.member.clientId);
  }
});

// Or with switch for multiple events
presence.subscribe((event) => {
  switch (event.type) {
    case PresenceEventType.Enter:
    case PresenceEventType.Leave:
      console.log('User presence changed:', event.type);
      break;
  }
});
```

### Message Serial Parameters Must Be Strings

**Expected Impact: Low**

Serial parameters in method signatures must now always be strings, not objects with a `serial` property.

**Before**

```ts
// Could pass object with serial property
const message = await messages.get({ serial: '123@456' });
```

**After**

```ts
// Must pass string directly
const message = await messages.get('123@456');
```

### Message Reaction Summary Event Restructured

**Expected Impact: Medium**

The structure of message reaction summary events has been updated.

**Before**

```ts
messageReactions.subscribe((event) => {
  const reactions = event.summary.reactions;
  const serial = event.summary.messageSerial;
});
```

**After**

```ts
messageReactions.subscribe((event) => {
  const reactions = event.reactions; // Renamed from summary
  const serial = event.messageSerial; // Lifted to top level
});
```

### Type Renames

**Expected Impact: Low**

Several types have been renamed:

#### QueryOptions → HistoryParams

**Before**

```ts
const options: QueryOptions = {
  limit: 50,
  orderBy: OrderBy.NewestFirst
};
const history = await messages.get(options);
```

**After**

```ts
const params: HistoryParams = {
  limit: 50,
  orderBy: OrderBy.NewestFirst
};
const history = await messages.get(params);
```

#### MessageOptions → MessagesOptions

**Before**

```ts
import { MessageOptions } from '@ably/chat';
let messageOptions: MessageOptions
const room = await rooms.get('room-name', {
  messages: messageOptions
});
```

**After**

```ts
import { MessagesOptions } from '@ably/chat';
let messagesOptions: MessagesOptions
const room = await rooms.get('room-name', {
  messages: messagesOptions
});
```

#### Message Reactions Type Renames

**Before**

```ts
import { MessagesReactions, MessageReactions } from '@ably/chat';

const messagesReactions: MessagesReactions = room.messages.reactions;
const summary: MessageReactions = event.summary;
```

**After**

```ts
import { MessageReactions, MessageReactionSummary } from '@ably/chat';

const messageReactions: MessageReactions = room.messages.reactions;
const summary: MessageReactionSummary = event.reactions;
```

### Type Safety Improvements

**Expected Impact: Low to Medium**

Several type definitions have been tightened for better type safety.

#### PresenceMember.extras

**Before**

```ts
const extras: any = presenceMember.extras;
```

**After**

```ts
const extras: JsonObject | undefined = presenceMember.extras;
```

#### Metadata Must Be JSON Serializable

**Before**

```ts
const metadata: Record<string, unknown> = {
  callback: () => {}, // Functions were technically allowed
  data: someValue
};
```

**After**

```ts
const metadata: JsonObject = {
  // Only JSON-serializable values allowed
  data: 'string',
  count: 123,
  nested: { key: 'value' }
};
```

#### ChatClient.clientId Is Now Optional

**Before**

```ts
const clientId: string = chatClient.clientId;
```

**After**

```ts
// May be undefined with token auth before connection
const clientId: string | undefined = chatClient.clientId;

// Check before use
if (chatClient.clientId) {
  console.log('Client ID:', chatClient.clientId);
}
```

#### Message Version Fields Non-Nullable

**Before**

```ts
interface MessageVersion {
  serial?: string;
  timestamp?: number;
}
```

**After**

```ts
interface MessageVersion {
  serial: string; // Always present
  timestamp: number; // Always present
}
```

### Message Reaction Event Types Split

**Expected Impact: Low**

Summary and raw message reaction events now have completely separate type definitions.

**Before**

```ts
type MessageReactionEventType = 'summaryChanged' | 'reactionSent' | 'reactionDeleted';
```

**After**

```ts
// Separate types for different subscription APIs
type MessageReactionSummaryEventType = 'summaryChanged';
type MessageReactionRawEventType = 'reactionSent' | 'reactionDeleted';
```

### Internal API Removals

**Expected Impact: Low**

Several internal APIs have been removed from public interfaces:

- `clientOptions` removed from Rooms interface (available from ChatClient)
- `Rooms.count` moved to internal interface
- Redundant `ChatMessageAction` enum members removed
- `Connection.dispose()` removed from public API (internal only)

## 0.13.x to 0.14.x

### Message API Changes

**Expected Impact: High**

The `Message` API has been updated to provide a cleaner, nested format for message versions.

#### Message Structure Changes

Several fields in the message structure have been updated:

1. **Version Field**: The `version` field, previously a serial string, is now an object containing the version serial and timestamp. It also contains a clientId, description, and metadata (previously held in the Operation field).
2. **Timestamp Field**: `createdAt` has been removed. The `timestamp` field now always represents the time a message was first created on the server. For the latest updated at timestamp, use `version.timestamp`.
3. **Operation Field**: The `Operation` field has been removed, with its contents now part of the version object.

**Before**

```ts
interface Message {
  timestamp: Date; // Time of last update
  createdAt: Date; // Time of creation
  version: string;
  operation: {
    clientId: string;
    description?: string;
    metadata?: Record<string, string>;
  };
  // ... other fields
}
```

**After**

```ts
interface Message {
  timestamp: Date; // Time of creation
  version: {
    serial: string;
    timestamp: Date; // Time of last update
    clientId: string;
    description?: string;
    metadata?: Record<string, string>;
  };
  // operation field removed - contents moved to version object
  // ... other fields
}
```

#### Migration Steps

1. Wherever the time that the message was created on the server is needed, ensure that `message.timestamp` is used.
2. Update code that accesses `message.version` as a string to access `message.version.serial`
3. Wherever the time that the message last updated on the server is needed, ensure that `message.version.timestamp` is used.
4. Update code that accesses operation fields to use the corresponding fields in `message.version`:
   - `message.operation.clientId` → `message.version.clientId`
   - `message.operation.description` → `message.version.description`
   - `message.operation.metadata` → `message.version.metadata`
5. Update any code that expects nested API responses to work with the direct message format

### Presence Data Type Changes

**Expected Impact: Low**

The `PresenceData` type has been updated to be a JSONable type for better serialization compatibility. This change ensures that presence data can be properly serialized and deserialized across different environments.

#### Type Changes

The `PresenceData` type now enforces JSONable types, meaning it must be serializable to JSON. This excludes functions, undefined values, symbols, and other non-serializable types.

**Before**

```ts
// This would have worked before but now causes type errors
const presenceData = {
  status: 'online',
  callback: () => console.log('hello'), // Function - not JSONable
  value: undefined, // undefined - not JSONable
};

await room.presence.enter(presenceData);
```

**After**

```ts
// Only JSONable types are allowed
const presenceData = {
  status: 'online',
  userId: '123',
  metadata: {
    lastSeen: new Date().toISOString(),
    count: 5
  }
};

await room.presence.enter(presenceData);
```

#### Defining Custom Presence Data Types

For better type safety, you can define your own custom type for presence data. It must be a JSON serializable object:

```ts
import { JsonValue } from '@ably/chat';

// Defining a custom type for presence data
interface MyPresenceData {
  [key: string]: JsonValue; // Type check for JSON compatibility
  status: 'online' | 'away' | 'busy';
  userId: string;
  profile: {
    name: string;
    avatar?: string;
  };
  lastSeen: string; // ISO date string
}

// Usage with your custom type
const presenceData: MyPresenceData = {
  status: 'online',
  userId: '123',
  profile: {
    name: 'John Doe',
    avatar: 'https://example.com/avatar.jpg'
  },
  lastSeen: new Date().toISOString()
};

await room.presence.enter(presenceData);
```

The `[key: string]: JsonValue` index signature ensures your custom type remains compatible with JSON serialization while still allowing you to define specific required properties.

## 0.12.x to 0.13.x

### usePresence Hook Changes

**Expected Impact: Medium**

The `usePresence` hook parameters have been updated to improve auto-enter/leave behavior and provide clearer intent.

#### Parameter Changes

The following parameters have been renamed or changed behavior:

- `enterWithData` → `initialData` - Now only used for initial auto-enter when component mounts. Changes to this value after first render are ignored.
- `leaveWithData` - Removed. Auto-leave now calls `leave()` without data.

**Before**

```ts
import { usePresence } from '@ably/chat/react';

const { update, enter, leave } = usePresence({
  enterWithData: { status: 'online' },
  leaveWithData: { reason: 'component_unmounted' }
});
```

**After**

```ts
import { usePresence } from '@ably/chat/react';

const { update, enter, leave } = usePresence({
  initialData: { status: 'online' }
  // leaveWithData removed - auto-leave calls leave() without data
});
```

#### Behavior Changes

The hook now tracks presence data internally and persists it across room re-attachments:

- **Data persistence**: The latest presence data from manual `enter()` or `update()` calls is now preserved across room re-attachments
- **Explicit leave tracking**: Calling `leave()` prevents automatic re-entry until `enter()` or `update()` is called again

#### Migration Steps

1. Replace `enterWithData` with `initialData`
2. Remove `leaveWithData` parameter - the hook will automatically call `leave()` without data during auto-leave
3. Update any code that relies on `leaveWithData` behavior to call `leave()` explicitly with the desired data
4. Consider that `initialData` is only used for the initial mount - use `update()` or `enter()` methods to change presence data after mounting

## 0.11.x to 0.12.x

No breaking changes. See [CHANGELOG.md](./CHANGELOG.md) for list of improvements.

## 0.10.x to 0.11.x

### Method Renames

**Expected Impact: High**

Several methods have been renamed for clarity and consistency.

#### useMessages Hook

The `send()` and `update()` methods returned by the `useMessages` React hook have been renamed for clarity and consistency.

**Before**

```ts
import { useMessages } from '@ably/chat/react';

const { send, update } = useMessages();
```

**After**

```ts
import { useMessages } from '@ably/chat/react';

const { sendMessage, updateMessage } = useMessages();
```

#### useRoomReactions Hook

The `send()` method in the `useRoomReactions` React hook has been renamed to `sendRoomReaction()` to avoid ambiguity and clashes with `useMessages` when both hooks are used in the same component.

**Before**

```ts
import { useRoomReactions } from '@ably/chat/react';

const { send } = useRoomReactions();
```

**After**

```ts
import { useRoomReactions } from '@ably/chat/react';

const { sendRoomReactions } = useRoomReactions();
```

### Typing Event Enum Values

**Expected Impact: Medium**

The `TypingEventType` enum values have been renamed.

**Before**

```ts
import { TypingEventType } from '@ably/chat';

TypingEventType.Start
TypingEventType.Stop
```

**After**

```ts
import { TypingEventType } from '@ably/chat';

TypingEventType.Started
TypingEventType.Stopped
```

### Presence Data Structure Changes

**Expected Impact: High**

The presence member structure has been updated:

**Before**

```ts
interface PresenceMember {
  clientId: string;
  data?: any;
  updatedAt: number; // timestamp
  // other fields...
}
```

**After**

```ts
interface PresenceMember {
  clientId: string;
  connectionId: string; // New field
  data?: any;
  updatedAt: Date; // Now uses Date type instead of number
  // other fields...
}
```

#### Code Changes Required

If you were accessing presence member data:

**Before**

```ts
room.presence.subscribe((event) => {
  const member = event.member;
  const timestamp = member.updatedAt; // number
  console.log('Updated at:', new Date(timestamp));
});
```

**After**

```ts
room.presence.subscribe((event) => {
  const member = event.member;
  const date = member.updatedAt; // Date
  const connectionId = member.connectionId; // New field available
  console.log('Updated at:', date);
  console.log('Connection ID:', connectionId);
});
```

## 0.9.x to 0.10.x

### Room Reaction Wire Protocol

**Expected Impact: Medium**

The room reactions wire protocol has been updated to reflect the change below. If you are using multiple SDKs (e.g. Mobile, Web), please ensure you update them at the same time
to avoid compatibility issues.

### Room Reaction Interface Rename

**Expected Impact: Medium**

The `Reaction` interface and related types have been renamed to `RoomReaction` to disambiguate against message reactions. The property `type` has been renamed to `name`.

#### Affected Types

The following types have been renamed:

- `Reaction` → `RoomReaction`
- `ReactionHeaders` → `RoomReactionHeaders`
- `ReactionMetadata` → `RoomReactionMetadata`
- `ReactionEvent` → `RoomReactionEvent`
- `ReactionEventType` → `RoomReactionEventType`
- `ReactionListener` → `RoomReactionListener`

#### Code Changes Required

**Before**

```ts
import { Reaction, ReactionEvent, ReactionListener } from '@ably/chat';

room.reactions.subscribe((event: ReactionEvent) => {
  const reaction: Reaction = event.reaction;
  console.log(reaction.type); // "like", "love", etc.
});
```

**After**

```ts
import { RoomReaction, RoomReactionEvent, RoomReactionListener } from '@ably/chat';

room.reactions.subscribe((event: RoomReactionEvent) => {
  const reaction: RoomReaction = event.reaction;
  console.log(reaction.name); // "like", "love", etc.
});
```

## 0.8.x to 0.9.x

### Reaction API Changes

**Expected Impact: Medium**

The `type` property has been renamed to `name` throughout the reactions API for consistency.

#### Reaction Interface

The `type` property in the `Reaction` interface has been renamed to `name`.

**Before**

```ts
room.reactions.subscribe((event) => {
  console.log(event.reaction.type); // "like", "love", etc.
});
```

**After**

```ts
room.reactions.subscribe((event) => {
  console.log(event.reaction.name); // "like", "love", etc.
});
```

#### Room Reactions

The `type` property in `SendReactionParams` has been renamed to `name`.

**Before**

```ts
await room.reactions.send({ type: 'like' });
```

**After**

```ts
await room.reactions.send({ name: 'like' });
```

## 0.7.x to 0.8.x

### Room ID Rename

**Expected Impact: High**

`roomId` has been renamed to `name` or `roomName` throughout the SDK.

This is to align terminology more closely with other Ably SDKs.

### Edit/Delete Message Signature

**Expected Impact: Low**

The signature of `messages.update()` and `messages.delete()` has changed.

The first argument is now a `Serial` - a union type that allows you to pass in anything that identifies a message serial.

This allows messages to be updated and deleted based on only knowing the serial.

### Event Restructuring

**Expected Impact: Medium**

In Occupancy, Room Reactions and Presence, the event received by the listeners you subscribe has changed to match the style used by messages and typing indicators. The main change is that
the entity (e.g. presence member) is now nested in the event.

All of the data that you originally had accessible by the old event versions is still present, just in different places.

#### Presence

**Before**

```ts
  room.presence.subscribe((event) => {
    // Log the presence member
    console.log(event);

    // Log the presence event type
    console.log(event.action);
  })
```

**After**

```ts
  room.presence.subscribe((event) => {
    // Log the presence member
    console.log(event.member);

    // Log the presence event type
    console.log(event.type);
  })
```

#### Occupancy

**Before**

```ts
  room.occupancy.subscribe((event) => {
    // Log the number of connections
    console.log(event.connections);
  })
```

**After**

```ts
  room.occupancy.subscribe((event) => {
    // Log the number of connections
    console.log(event.occupancy.connections)
  })
```

#### Room Reactions

**Before**

```ts
  room.reactions.subscribe((event) => {
    // Log the reaction type
    console.log(event.type);
  })
```

**After**

```ts
  room.reactions.subscribe((event) => {
    // Log the reaction type
    console.log(event.reaction.type);
  })
```

### Enum Changes

**Expected Impact: Medium**

- All enums are now **singular**.
- The enums called `XEvents` have been renamed to `XEventType`. For example, `MessageEvents` is now `MessageEventTypes`.

### Unsubscribe All

**Expected Impact: Low**

We have removed the `unsubscribeAll()` and `offAll()` methods from the SDK. This is to avoid situations where all listeners are accidentally removed.

### Occupancy and Typing Methods Renames

The method `current` has been added to Occupancy to provide the latest occupancy values received in realtime

The method `Typing.get()` has been re-named to `Typing.current()` as it exhibits similar behavior.

### Operation Predicates

**Expected Impact: Low**

- Sending typing indicators now requires the connection status to be `Connected`.
- Sending room reactions now requires the connection status to be `Connected`.

This is to avoid messages being queued, which is in contrast to their ephemeral instantaneous use-case.

### Message Reactions Send

**Expected Impact: Low**

`messages.reactions.add()` has been renamed to `send()`

## 0.6.x to 0.7.x

### Room Options Restructuring

**Expected Impact: High**

Room options have been significantly restructured and are now an optional parameter when creating a room.
The `AllFeaturesEnabled` constant has been removed, and all features are now accessible regardless of the room options provided (this is related to the channel architecture change below).

Room options are now organized into categories:
- `typing` - Options for typing indicators
- `occupancy` - Options for room occupancy events
- `presence` - Options for presence events
- `messages` - (Experimental) Options for message reactions

Events for `presence` and `occupancy` can now be enabled or disabled through the `enableEvents` property of their respective options objects.

If no options for a particular feature are provided, the default options will be used. Please note:
- Occupancy events are disabled by default (`occupancy.enableEvents: false`)
- Presence events are enabled by default (`presence.enableEvents: true`)
- Message reactions are disabled by default (`messages.rawMessageReactions: false`)
- Typing indicators use a default heartbeat throttle of 10000ms

If some options are provided, the default options will be merged with the provided options, the provided options taking precedence.

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
2. The `change` field contains the single change that occurred, which is either `TypingEventTypes.Start` or `TypingEventTypes.Stop`, and the `clientId` of the user who started or stopped typing.

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

### REST endpoint Changes

**Expected Impact: low**

The REST endpoints for the SDK have all been updated to use the latest v3 API. This may be an issue if you are using the REST API directly, but should not affect most users.

Before:
```ts
const messagesEndpoint = 'https://realtime.ably.io/chat/v2/rooms/${roomId}/messages'
const occupancyEndpoint = 'https://realtime.ably.io/chat/v2/rooms/${roomId}/occupancy'
```

After:
```ts
const messagesEndpoint =  'https://realtime.ably.io/chat/v3/rooms/${roomId}/messages'
const occupancyEndpoint = 'https://realtime.ably.io/chat/v3/rooms/${roomId}/occupancy'
```

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

#### React

Before:

```ts
import { Message } from '@ably/chat';
import { useMessages } from '@ably/chat/react';
```

After:

```ts
import { Message, useMessages } from '@ably/chat';
```

#### React Native

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
| Get the "current" status of a room                       | `room.status.current`                                | `room.status`                                     |
| Get the "current" error related to the room status       | `room.status.error`                                  | `room.error`                                      |
| Subscribe to room status updates                         | `room.status.onChange`                               | `room.onStatusChange`                             |
| Remove all room status subscribers                       | `room.status.offAll`                                 | `room.offAllStatusChange`                         |
| Compare the room status to some value                    | `roomStatus === RoomLifecycle.Attached`              | `roomStatus === RoomStatus.Attached`              |
| Get the "current" connection status                      | `chat.connection.status.current`                     | `chat.connection.status`                          |
| Get the "current" error related to the connection status | `chat.connection.status.error`                       | `chat.connection.error`                           |
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
