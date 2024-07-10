# Ably Chat SDK

<p style="text-align: left">
    <img src="https://img.shields.io/badge/development_status-Private_Beta-ab7df8" alt="Development status"   />
    <img src="https://badgen.net/github/license/3scale/saas-operator" alt="License" />
</p>

Ably Chat is a set of purpose-built APIs for a host of chat features enabling you to create 1:1, 1:Many, Many:1 and Many:Many chat rooms for any scale. It is designed to meet a wide range of chat use cases, such as livestreams, in-game communication, customer support, or social interactions in SaaS products. Built on [Ably's](https://ably.com/) core service, it abstracts complex details to enable efficient chat architectures.

> [!IMPORTANT]  
> This SDK is currently under development. If you are interested in being an early adopter and providing feedback then you can [sign up to the private beta](https://forms.gle/vB2kXhCXrTQpzHLu5) and are welcome to [provide us with feedback](https://forms.gle/mBw9M53NYuCBLFpMA). Coming soon: React Hooks for Ably Chat.

Get started using the [📚 documentation](https://ably.com/docs/products/chat) and [🚀check out the live demo](https://ably-livestream-chat-demo.vercel.app/), or [📘 browse the API reference](https://sdk.ably.com/builds/ably/ably-chat-js/main/typedoc/).

![Ably Chat Header](/images/ably-chat-github-header.png)

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

## Instantiation and authentication

To instantiate the Chat SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the
Chat constructor:

```ts
import ChatClient from '@ably/chat';
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
const connectionStatus = chat.connection.status.current;
const connectionError = chat.connection.status.error;
```

### Subscribing to connection status changes

You can subscribe to connection status changes by registering a listener, like so:

```ts
const { off } = chat.connection.status.onChange((change) => console.log(change));
```

To stop listening to changes, call the provided `off` method:

```ts
off();
```

To remove all listeners at the same time, you can call `offAll`:

```ts
chat.connection.status.offAll();
```

## Chat rooms

### Creating or retrieving a chat room

You can create or retrieve a chat room with name `"basketball-stream"` this way:

```ts
const room = chat.rooms.get('basketball-stream', { reactions: RoomOptionsDefaults.reactions });
```

The second argument to `rooms.get` is a `RoomOptions` argument, which tells the Chat SDK what features you would like your room to use and how they should be configured. For example, you can set the timeout between keystrokes for typing events as part of the room options. Sensible defaults are provided for your convenience.

In order to use the same room but with different options, you must first `release` the room before requesting an instance with the changed options (see below for more information on releasing rooms).

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

Various aspects of the room's status can be found at the `room.status` property.

### Current status of a room

To get the current status, you can use the `current` property:

```ts
const roomStatus = room.status.current;
const roomError = room.status.error;
```

### Listening to room status updates

You can also subscribe to changes in the room status and be notified whenever they happen by registering a listener:

```ts
const { off } = room.status.onChange((change) => console.log(change));
```

To stop listening to changes, you can call the provided `off` function:

```ts
off();
```

Or you can remove all listeners at once:

```ts
room.status.offAll();
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

### Message payload

```json5
{
  timeserial: 'string',
  clientId: 'string',
  roomId: 'string',
  text: 'string',
  createdAt: 'number',
  metadata: 'Record<string, unknown>',
  headers: 'Record<string, number | string | boolean | null | undefined>',
}
```

### Metadata and headers for chat messages

**Metadata** is a map of extra information that can be attached to chat messages. Metadata is not used by Ably and is sent as part of the realtime message payload. Example use cases are setting custom styling (like background or text color or fonts), adding links to external images, emojis, etc.

**Headers** are a flat key-value map and are sent as part of the realtime message's extras inside the headers property. They can serve similar purposes as metadata but they are read by Ably and can be used for things such as [subscription filters](https://faqs.ably.com/subscription-filters).

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

### Subscribing to incoming messages

To subscribe to incoming messages, call `subscribe` with your listener.

```ts
const { unsubscribe } = room.messages.subscribe((msg) => console.log(msg));
```

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
const historicalMessages = await room.messages.get({ direction: 'backwards', limit: 50 });
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

### Sending a reaction

To send a reaction such as `"like"`:

```ts
await room.reactions.send({ type: 'like' });
```

You can also add any metadata to reactions:

```ts
await room.reactions.send({ type: 'like', metadata: { effect: 'fireworks' } });
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

For guidance on how to contribute to this project, see the [CONTRIBUTING.md](CONTRIBUTING.md).

## Support, feedback and troubleshooting

Please visit http://support.ably.com/ for access to our knowledge base and to ask for any assistance. You can also view the [community reported Github issues](https://github.com/ably/ably-chat-js/issues) or raise one yourself.

To see what has changed in recent versions, see the [changelog](CHANGELOG.md).

## Further reading

- See a [simple chat example](/demo/) in this repo.
- Play with the [livestream chat demo](https://ably-livestream-chat-demo.vercel.app/).
- [Sign up](https://forms.gle/gRZa51erqNp1mSxVA) to the private beta and get started.
- [Share feedback or request](https://forms.gle/mBw9M53NYuCBLFpMA) a new feature.
