# Ably Chat SDK for TypeScript and React

<p style="text-align: left">
    <img src="https://badgen.net/github/license/3scale/saas-operator" alt="License" />
    <img src="https://img.shields.io/npm/v/@ably/chat.svg?style=flat">
</p>

Ably Chat is a set of purpose-built APIs for a host of chat features enabling you to create 1:1, 1:Many, Many:1 and Many:Many chat rooms for any scale. It is designed to meet a wide range of chat use cases, such as livestreams, in-game communication, customer support, or social interactions in SaaS products. Built on [Ably's](https://ably.com/) core service, it abstracts complex details to enable efficient chat architectures.

Get started using the [📚 documentation](https://ably.com/docs/products/chat) and [🚀check out the live demo](https://ably-livestream-chat-demo.vercel.app/), or [📘 browse the API reference](https://sdk.ably.com/builds/ably/ably-chat-js/main/typedoc/).

![Ably Chat Header](/images/ably-chat-github-header.png)

## Supported Platforms

This SDK supports the following platforms:

**Browsers**: All major desktop and mobile browsers, including (but not limited to) Chrome, Firefox, Edge, Safari on iOS and macOS, Opera, and Android browsers. Internet Explorer is not supported.

**Node.js**: Version 20.x or newer.

**Typescript**: This library is written in TypeScript and has full TypeScript support.

**React**: The library ships with a number of providers and hooks for React, which provide a closer integration with that ecosystem. For more information on using Ably Chat in React, see the [React readme](./src/react/README.md).

**React Native** We aim to support all platforms supported by React Native. If you find any issues please raise an issue or contact us.

## Supported chat features

This project is under development so we will be incrementally adding new features. At this stage, you'll find APIs for the following chat features:

- Chat rooms for 1:1, 1:many, many:1 and many:many participation.
- Sending, receiving, editing and deleting chat messages.
- Online status aka presence of chat participants.
- Chat room occupancy, i.e total number of connections and presence members.
- Typing indicators
- Room-level reactions (ephemeral at this stage)

If there are other features you'd like us to prioritize, please [let us know](https://forms.gle/mBw9M53NYuCBLFpMA).

## Usage

You will need the following prerequisites:

- An Ably account
  - You can [sign up](https://ably.com/signup) to the generous free tier.
- An Ably API key
  - Use the default or create a new API key in an app within
    your [Ably account dashboard](https://ably.com/dashboard).
  - Make sure your API key has the
    following [capabilities](https://ably.com/docs/auth/capabilities): `publish`, `subscribe`, `presence`, `history` and `channel-metadata`.

## Installation

Install the Chat SDK:

```sh
npm install @ably/chat
```

For browsers, you can also include the Chat SDK directly into your HTML:

```html
<!-- Ably Chat also requires the core Ably SDK to be available -->
<script src="https://cdn.ably.com/lib/ably.min-2.js"></script>
<script src="https://cdn.ably.com/lib/ably-chat.umd.cjs-0.js"></script>
<script>
  const realtime = new Ably.Realtime({ key: 'your-ably-key' });
  const chatClient = new AblyChat.ChatClient(realtime);
</script>
```

> [!IMPORTANT]
> If you're using Chat in React Native, please see the additional setup step [here](./src/react/README.md).

## Versioning

The Ably client library follows [Semantic Versioning](http://semver.org/). To lock into a major or minor version of the client library, you can specify a specific version number such as https://cdn.ably.com/lib/ably-chat-0.js for all v0._ versions, or https://cdn.ably.com/lib/ably-chat-0.1.js for all v0.1._ versions, or you can lock into a single release with https://cdn.ably.com/lib/ably-chat-0.1.0.js. See https://github.com/ably/ably-chat-js/tags for a list of tagged releases.

## Instantiation and authentication

To instantiate the Chat SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the
Chat constructor:

```ts
import { ChatClient } from '@ably/chat';
import * as Ably from 'ably';

const ably = new Ably.Realtime({ key: '<API-key>', clientId: '<client-ID>' });
const chat = new ChatClient(ably);
```

You can use [basic authentication](https://ably.com/docs/auth/basic) i.e. the API Key directly for testing purposes,
however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production
environments.

To use Chat you must also set a [`clientId`](https://ably.com/docs/auth/identified-clients) so that clients are
identifiable. If you are prototyping, you can use a package like [nanoid](https://www.npmjs.com/package/nanoid) to
generate an ID.

## Connections

The Chat SDK uses a single connection to Ably, which is exposed via the `ChatClient.connection` property. You can use this
property to observe the connection state and take action accordingly.

### Current connection status

You can view the current connection status at any time:

```ts
const connectionStatus = chat.connection.status;
const connectionError = chat.connection.error;
```

### Subscribing to connection status changes

You can subscribe to connection status changes by registering a listener, like so:

```ts
const { off } = chat.connection.onStatusChange((change) => console.log(change));
```

To stop listening to changes, call the provided `off` method:

```ts
off();
```

To remove all listeners at the same time, you can call `offAllStatusChange`:

```ts
chat.connection.offAllStatusChange();
```

## Chat rooms

### Creating or retrieving a chat room

You can create or retrieve a chat room with name `"basketball-stream"` this way:

```ts
const room = await chat.rooms.get('basketball-stream', { reactions: RoomOptionsDefaults.reactions });
```

The second argument to `rooms.get` is a `RoomOptions` argument, which tells the Chat SDK what features you would like your room to use and how they should be configured.

For example, you can set the timeout between keystrokes for typing events as part of the room options. Sensible defaults for each of the features are provided for your convenience:

- A typing timeout (time of inactivity before typing stops) of 5 seconds.
- Entry into, and subscription to, presence.

The defaults options for each feature may be viewed [here](https://github.com/ably/ably-chat-js/blob/main/src/core/room-options.ts).

In order to use the same room but with different options, you must first `release` the room before requesting an instance with the changed options (see below for more information on releasing rooms).

Note that:

- If a `release` call is currently in progress for the room (see below), then a call to `get` will wait for that to resolve before resolving itself.
- If a `get` call is currently in progress for the room and `release` is called, the `get` call will reject.

### Attaching to a room

To start receiving events on a room, it must first be attached. This can be done using the `attach` method.

```ts
// Add a listener so it's ready at attach time (see below for more information on listeners)
room.messages.subscribe((msg) => console.log(msg));

await room.attach();
```

### Detaching from a room

To stop receiving events on a room, it must be detached, which can be achieved by using the `detach` method.

```ts
await room.detach();
```

Note: This does not remove any event listeners you have registered and they will begin to receive events again in the
event that the room is re-attached.

### Releasing a room

Depending on your application, you may have multiple rooms that come and go over time (e.g. if you are running 1:1 support chat). When you are completely finished with a room, you may `release` it which allows the underlying resources to be collected.

```ts
await rooms.release('basketball-stream');
```

Once `release` is called, the room will become unusable and you will need to get a new instance using `rooms.get` should you wish to re-start the room.

Note that releasing a room may be optional for many applications.

### Monitoring room status

Monitoring the status of the room is key to a number of common chat features. For example, you might want to display a warning when the room has become detached.

### Current status of a room

To get the current status, you can use the `status` property:

```ts
const roomStatus = room.status;
const roomError = room.error;
```

### Listening to room status updates

You can also subscribe to changes in the room status and be notified whenever they happen by registering a listener:

```ts
const { off } = room.onStatusChange((change) => console.log(change));
```

To stop listening to changes, you can call the provided `off` function:

```ts
off();
```

Or you can remove all listeners at once:

```ts
room.offAllStatusChange();
```

## Handling discontinuity

There may be instances where the connection to Ably is lost for a period of time, for example, when the user enters a tunnel. In many circumstances, the connection will recover and operation
will continue with no discontinuity of messages. However, during extended periods of disconnection, continuity cannot be guaranteed and you'll need to take steps to recover
messages you might have missed.

Each feature of the Chat SDK provides an `onDiscontinuity` handler. Here you can register a listener that will be notified whenever a discontinuity in that feature has been observed.

Taking messages as an example, you can listen for discontinuities like so:

```ts
const { off } = room.messages.onDiscontinuity((reason?: ErrorInfo) => {
  // Recover from the discontinuity
});
```

You can then stop listening for discontinuities by calling the provided `off` function.

## Chat messages

### Sending messages

To send a message, simply call `send` on the `room.messages` property, with the message you want to send.

```ts
const message = await room.messages.send({ text: 'This was a great shot!' });
```

### Metadata and headers for chat messages

**Metadata** is a map of extra information that can be attached to chat messages. `metadata` is not used by Ably and is sent as part of the realtime message payload. Example use cases are setting custom styling (like background or text color or fonts), adding links to external images, emojis, etc.

**Headers** are a flat key-value map and are sent as part of the realtime message's `extras` inside the `headers` property. They can serve similar purposes as `metadata` but they are read by Ably and can be used for things such as [subscription filters](https://faqs.ably.com/subscription-filters).

To pass headers and/or metadata when sending a chat message:

```typescript
const message = await room.messages.send({
  text: 'This was a great shot!',
  metadata: {
    effect: {
      name: 'fireworks',
      fullScreen: true,
      duration: 500,
    },
  },
  headers: {
    hasEffects: true,
  },
});
```

### Updating messages

To update an existing message, call `update` on the `room.messages` property, with the original message you want to update, the updated fields, and optional operation details to provide extra context for the update.

The optional operation details are:

- `description`: a string that can be used to inform others as to why the message was updated.
- `metadata`: a map of extra information that can be attached to the update operation.

Example

```typescript
const updatedMessage = await room.messages.update(
  message,
  {
    text: 'hello, this is edited',
  },
  {
    description: 'edit example',
  },
);
```

`updatedMessage` is a Message object with all updates applied. As with sending and deleting, the promise may resolve after the updated message is received via the messages subscription.

A `Message` that was updated will have values for `updatedAt` and `updatedBy`, and `isUpdated()` will return `true`.

Note that if you delete an updated message, it is no longer considered _updated_. Only the latest operation takes effect.

#### Handling updates in realtime

Updated messages received from the server have the `action` parameter set to `ChatMessageActions.MessageUpdate`, and the event received has the `type` set to `MessageEvents.Updated`. Updated messages are full copies of the message, meaning that all that is needed to keep a state or UI up to date is to replace the old message with the received one.

On rare occasions updates might arrive from the server out of order (in terms of the global order in which these events occur). An example of this is when messages are transiting between regions, and latencies between nearby regions is lower than those further away. To deterministically determine whether an update should supersede the current version, simply compare the `version` strings using the standard `<` and `>` operators. Alternatively, the `Message` interface provides convenience methods to compare two instances of the same base message to determine which version is newer: `versionBefore()`, `versionAfter()`, and `versionEqual()`.

The same out-of-order situation can happen between updates received over realtime and HTTP responses (e.g. when updating a message). In the situation where two concurrent updates happen, both might be received via realtime before the HTTP response of the first one arrives. Always compare the message `version` to determine which instance of a `Message` is newer.

Example for handling updates:

```typescript
const messages: Message[] = []; // assuming this is where state is kept

room.messages.subscribe((event) => {
  switch (event.type) {
    case MessageEvents.Updated: {
      const serial = event.message.serial;
      const index = messages.findIndex((m) => m.serial === serial);
      if (index !== -1 && messages[index].version < event.message.version) {
        messages[index] = event.message;
      }
      break;
    }
    // other event types (ie. created and updated) omitted
  }
});
```

### Deleting messages

To delete a message, call `delete` on the `room.messages` property, with the original message you want to delete.

You can supply optional parameters to the `delete` method to provide additional context for the deletion.

These additional parameters are:

- `description`: a string that can be used to inform others as to why the message was deleted.
- `metadata`: a map of extra information that can be attached to the deletion message.

The return of this call will be the deleted message, as it would appear to other subscribers of the room.
This is a _soft delete_ and the message will still be available in the history.

Example

```ts
const deletedMessage = await room.messages.delete(message, {
  description: 'This message was deleted for ...',
});
```

`deletedMessage` is a Message object with the deletion applied. As with sending, the promise may resolve after the deletion message is received via the messages subscription.

A `Message` that was deleted will have `deletedAt` and `deletedBy` fields set, and `isDeleted()` will return `true`.

Note that you can update deleted messages, which will effectively undo the deletion. Only the last operation on a message takes effect.

```ts
const { unsubscribe } = room.messages.subscribe((msg) => console.log(msg));
```

#### Handling deletes in realtime

Deletion messages received from the server have the `action` parameter set to `ChatMessageActions.MessageDelete`, and the event received has the `type` set to `MessageEvents.Deleted`. Similar to `updates`, `deletion` messages are also full copies of the message, meaning that all that is needed to keep a state or UI up to date is to replace the old message with the received one.

On rare occasions, deletes and updates might arrive over realtime out of order. Again, should two concurrent actions happen in disparate regions, you will likely receive the action processed in the region closest to you first, for example.

When the second action arrives, you will need to determine the order of these actions; this is done deterministically by comparing the `version` field of the messages, using the standard `<` and `>` operators. For convenience, the `Message` interface provides methods to compare two instances of the same base message to determine which action is newer:`versionBefore()`, `versionAfter()`, and `versionEqual()`.

The same out-of-order situation can happen between deletions received over realtime and HTTP responses, whereby both might be received via realtime before the HTTP response of the first one arrives.

Example for handling deletes:

```typescript
const messages: Message[] = []; // assuming this is where state is kept

room.messages.subscribe((event) => {
  switch (event.type) {
    case MessageEvents.Deleted: {
      const serial = event.message.serial;
      const index = messages.findIndex((m) => m.serial === serial);
      if (index !== -1 && messages[index].versionBefore(event.message)) {
        messages[index] = event.message;
      }
      break;
    }
    // other event types (ie. created and updated) omitted
  }
});
```

### Subscribing to incoming messages

To subscribe to incoming messages, call `subscribe` with your listener.

### Unsubscribing from incoming messages

When you're done with the listener, call `unsubscribe` to remove that listeners subscription and prevent it from receiving
any more events.

```ts
const { unsubscribe } = room.messages.subscribe((msg) => console.log(msg));

// Time passes...
unsubscribe();
```

You can remove all of your listeners in one go like so:

```ts
room.messages.unsubscribeAll();
```

### Retrieving message history

The messages object also exposes the `get` method which can be used to request historical messages in the chat room according
to the given criteria. It returns a paginated response that can be used to request more messages.

```typescript
const historicalMessages = await room.messages.get({ orderBy: OrderBy.NewestFirst, limit: 50 });
console.log(historicalMessages.items);
if (historicalMessages.hasNext()) {
  const next = await historicalMessages.next();
  console.log(next);
} else {
  console.log('End of messages');
}
```

### Retrieving message history for a subscribed listener

In addition to being able to unsubscribe from messages, the return value from `messages.subscribe` also includes the `getPreviousMessages` method. It can be used to request
historical messages in the chat room that were sent up to the point a that particular listener was subscribed. It returns a
paginated response that can be used to request for more messages.

```ts
const { getPreviousMessages } = room.messages.subscribe(() => {
  console.log('New message received');
});

const historicalMessages = await getPreviousMessages({ limit: 50 });
console.log(historicalMessages.items);
if (historicalMessages.hasNext()) {
  const next = await historicalMessages.next();
  console.log(next);
} else {
  console.log('End of messages');
}
```

## Online status

### Retrieving online members

You can get the complete list of currently online or present members, their state and data, by calling the `presence.get` method.

```ts
// Retrieve the entire list of present members
const presentMembers = await room.presence.get();

// You can supply a clientId to retrieve the presence of a specific member with the given clientId
const presentMember = await room.presence.get({ clientId: 'client-id' });

// You can call this to get a simple boolean value of whether a member is present or not
const isPresent = await room.presence.isUserPresent('client-id');
```

Calls to `presence.get()` will return an array of the presence messages, where each message contains the most recent
data for a member.

### Entering the presence set

To appear online for other users, you can enter the presence set of a chat room. While entering presence, you can provide optional data that will be associated with the presence message.

```ts
await room.presence.enter({ status: 'available' });
```

### Updating the presence data

Updates allow you to make changes to the custom data associated with a present user. Common use-cases include updating the users'
status or profile picture.

```ts
await room.presence.update({ status: 'busy' });
```

### Leaving the presence set

Ably automatically triggers a presence leave if a client goes offline. But you can also manually leave the presence set as a result of a UI action. While leaving presence, you can provide optional data that will be associated with the presence message.

```ts
await room.presence.leave({ status: 'Be back later!' });
```

### Subscribing to presence updates

You can provide a single listener, if so, the listener will be subscribed to receive all presence event types.

```ts
const { unsubscribe } = room.presence.subscribe((event: PresenceEvent) => {
  switch (event.action) {
    case 'enter':
      console.log(`${event.clientId} entered with data: ${event.data}`);
      break;
    case 'leave':
      console.log(`${event.clientId} left`);
      break;
    case 'update':
      console.log(`${event.clientId} updated with data: ${event.data}`);
      break;
  }
});
```

You can also provide a specific event type or types to subscribe to along with a listener.

```ts
const { unsubscribe } = room.presence.subscribe('enter', (event: PresenceEvent) => {
  console.log(`${event.clientId} entered with data: ${event.data}`);
});

const { unsubscribe } = room.presence.subscribe(['update', 'leave'], (event: PresenceEvent) => {
  console.log(`${event.clientId} updated with data: ${event.data}`);
});
```

### Unsubscribing from presence updates

To unsubscribe a specific listener from presence events, you can call the `unsubscribe` method provided in the response to the `subscribe` call.

```ts
const { unsubscribe } = room.presence.subscribe((event: PresenceEvent) => {
  // Handle events
});

// Unsubscribe
unsubscribe();
```

Similarly to messages, you can call `presence.unsubscribeAll` to remove all listeners at once.

## Typing indicators

Typing events allow you to inform others that a client is typing and also subscribe to others' typing status.

### Retrieving the set of current typers

You can get the complete set of the current typing `clientId`s, by calling the `typing.get` method.

```ts
// Retrieve the entire list of currently typing clients
const currentlyTypingClientIds = await room.typing.get();
```

### Start typing

To inform other users that you are typing, you can call the start method. This will begin a timer that will automatically stop typing after a set amount of time.

```ts
await room.typing.start();
```

Repeated calls to start will reset the timer, so the clients typing status will remain active.

```ts
await room.typing.start();
// Some short delay - still typing
await room.typing.start();
// Some short delay - still typing
await room.typing.start();
// Some long delay - timer expires, stopped typing event emitted and listeners are notified
```

### Stop typing

You can immediately stop typing without waiting for the timer to expire.

```ts
await room.typing.start();
// Some short delay - timer not yet expired
await room.typing.stop();
// Timer cleared and stopped typing event emitted and listeners are notified
```

### Subscribing to typing updates

To subscribe to typing events, provide a listener to the `subscribe` method.

```ts
const { unsubscribe } = room.typing.subscribe((event) => {
  console.log('currently typing:', event.currentlyTyping);
});
```

### Unsubscribing from typing updates

To unsubscribe the listener, you can call the corresponding `unsubscribe` method returned by the `subscribe` call:

```ts
const { unsubscribe } = room.typing.subscribe((event) => {
  console.log(event);
});

// Time passes
unsubscribe();
```

You can remove all listeners at once by calling `typing.unsubscribeAll()`.

## Occupancy of a chat room

Occupancy tells you how many users are connected to the chat room.

### Subscribing to occupancy updates

To subscribe to occupancy updates, subscribe a listener to the chat rooms `occupancy` member:

```ts
const { unsubscribe } = room.occupancy.subscribe((event) => {
  console.log(event);
});
```

### Unsubscribing from occupancy updates

To unsubscribe, call the corresponding `unsubscribe` method:

```ts
const { unsubscribe } = room.occupancy.subscribe((event) => {
  console.log(event);
});

// Time passes...
unsubscribe();
```

You can remove all listeners at once by calling `occupancy.unsubscribeAll()`.

Occupancy updates are delivered in near-real-time, with updates in quick succession batched together for performance.

### Retrieving the occupancy of a chat room

You can request the current occupancy of a chat room using the `occupancy.get` method:

```ts
const occupancy = await room.occupancy.get();
```

## Room-level reactions

You can subscribe to and send ephemeral room-level reactions by using the `room.reactions` objects.

To send room-level reactions, you must be [attached](#attaching-to-a-room) to the room.

### Sending a reaction

To send a reaction such as `"like"`:

```ts
await room.reactions.send({ type: 'like' });
```

You can also add any metadata and headers to reactions:

```ts
await room.reactions.send({
  type: 'like',
  metadata: { effect: 'fireworks' },
  headers: { streamId: 'basketball-stream' },
});
```

### Subscribing to room reactions

Subscribe to receive room-level reactions:

```ts
const { unsubscribe } = room.reactions.subscribe((reaction) => {
  console.log('received a', reaction.type, 'with metadata', reaction.metadata);
});
```

### Unsubscribing from room reactions

To unsubscribe, call the corresponding `unsubscribe` method:

```ts
const { unsubscribe } = room.reactions.subscribe((reaction) => {
  console.log('received a', reaction.type, 'with metadata', reaction.metadata);
});

// Time passes...
unsubscribe();
```

You can remove all listeners at once by calling `reactions.unsubscribeAll()`.

## Handling encoded objects in integrations

If you have set up an [Ably integration](https://ably.com/docs/general/integrations) to receive events from your chat
room, depending on your configuration, you may receive these as encoded objects.
See [here](https://ably.com/docs/general/webhooks) for more information.
Should you wish to convert this object to a chat type, you can use the functions below to help you.

For example, if you have the following item reach your integration:

```json
{
  "items": [
    {
      "webhookId": "Ja-tsg",
      "source": "channel.message",
      "serial": "108iZpUxQBe4Vv35120919@1720954404104-0",
      "timestamp": 1720954404104,
      "name": "channel.message",
      "data": {
        "channelId": "some-room::$chat::$chatMessages",
        "site": "eu-west-1-A",
        "messages": [
          {
            "id": "chat:6TP2sA:some-room:a4534b0ab37bdd5:0",
            "clientId": "user1",
            "timestamp": 1720954404104,
            "serial": "108iZpUxQBe4Vv35120919@1720954404104-0",
            "action": 1,
            "encoding": "json",
            "extras": {
              "headers": {}
            },
            "data": "{\"text\":\"some text data\",\"metadata\":{}}",
            "name": "chat.message"
          }
        ]
      }
    }
  ]
}
```

You should use `getEntityTypeFromEncoded` to first retrieve the chat entity type of the encoded message,
then call either `chatMessageFromEncoded` or `reactionFromEncoded` depending on the entity type.

```ts
import { getEntityTypeFromEncoded, chatMessageFromEncoded, reactionFromEncoded, ChatEntityType } from '@ably/chat';

integrationMessage.items.forEach((item) => {
  item.data.messages.forEach(async (encodedMessage) => {
    const entityType = getEntityTypeFromEncoded(encodedMessage);
    switch (entityType) {
      case ChatEntityType.ChatMessage:
        const chatMessage = await chatMessageFromEncoded(encodedMessage);
        console.log(chatMessage);
        break;
      case ChatEntityType.Reaction:
        const reaction = await reactionFromEncoded(encodedMessage);
        console.log(reaction);
        break;
      default:
        console.log('Unknown entity type');
    }
  });
});
```

## Handling Ably messages

If you are working with the underlying channels directly and not using the Chat SDK, you can use these functions to
convert an inbound Ably message to a chat type.
You can use `getEntityTypeFromAblyMessage` to retrieve the chat entity type of the message,
then call either `chatMessageFromAblyMessage` or `reactionFromAblyMessage` depending on the entity type.

```ts
import * as Ably from 'ably';
import {
  getEntityTypeFromAblyMessage,
  chatMessageFromAblyMessage,
  reactionFromAblyMessage,
  ChatEntityType,
} from '@ably/chat';

const entityType = getEntityTypeFromAblyMessage(inboundMessage as Ably.InboundMessage);

switch (entityType) {
  case ChatEntityType.ChatMessage:
    const chatMessage = chatMessageFromAblyMessage(inboundMessage as Ably.InboundMessage);
    console.log(chatMessage);
    break;
  case ChatEntityType.Reaction:
    const reaction = reactionFromAblyMessage(inboundMessage as Ably.InboundMessage);
    console.log(reaction);
    break;
  default:
    console.log('Unknown entity type');
}
```

## In-depth

### Channels Behind Chat Features

It might be useful to know that each feature is backed by an underlying Pub/Sub channel. You can use this information to enable interoperability with other platforms by subscribing to the channels directly using the [Ably Pub/Sub SDKs](https://ably.com/docs/products/channels) for those platforms.

The channel for each feature can be obtained via the `channel` property
on that feature.

```ts
const messagesChannel = room.messages.channel;
```

**Warning**: You should not attempt to change the state of a channel directly. Doing so may cause unintended side-effects in the Chat SDK.

### Channels Used

For a given chat room, the channels used for features are as follows:

| Feature   | Channel                              |
| --------- | ------------------------------------ |
| Messages  | `<roomId>::$chat::$chatMessages`     |
| Presence  | `<roomId>::$chat::$chatMessages`     |
| Occupancy | `<roomId>::$chat::$chatMessages`     |
| Reactions | `<roomId>::$chat::$reactions`        |
| Typing    | `<roomId>::$chat::$typingIndicators` |

---

## Contributing

For guidance on how to contribute to this project, see the [contributing guidelines](CONTRIBUTING.md).

## Support, feedback and troubleshooting

Please visit http://support.ably.com/ for access to our knowledge base and to ask for any assistance. You can also view the [community reported Github issues](https://github.com/ably/ably-chat-js/issues) or raise one yourself.

To see what has changed in recent versions, see the [changelog](CHANGELOG.md).

## Further reading

- See a [simple chat example](/demo/) in this repo.
- Play with the [livestream chat demo](https://ably-livestream-chat-demo.vercel.app/).
- [Share feedback or request](https://forms.gle/mBw9M53NYuCBLFpMA) a new feature.
