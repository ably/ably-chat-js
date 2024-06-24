# Ably Chat SDK

The **Chat SDK** offers a seamless and customizable API designed to facilitate diverse
in-app conversations scenarios, encompassing live comments, in-app chat functionalities,
and the management of real-time updates and user interactions.

[Read the API docs here](https://sdk.ably.com/builds/ably-labs/ably-chat-js/main/typedoc/)

## Prerequisites

To start using this SDK, you will need the following:

- An Ably account
  - You can [sign up](https://ably.com/signup) to the generous free tier.
- An Ably API key
  - Use the default or create a new API key in an app within
    your [Ably account dashboard](https://ably.com/dashboard).
  - Make sure your API key has the
    following [capabilities](https://ably.com/docs/auth/capabilities): `publish`, `subscribe`, `presence`
    and `history`.

## Installation and authentication

Install the Ably JavaScript SDK and the Chat SDK:

```sh
npm install ably @ably/chat
```

To instantiate the Chat SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the
Chat constructor:

```ts
import ChatClient from '@ably/chat';
import * as Ably from 'ably';

const ably = new Ably.Realtime({ key: '<API-key>', clientId: '<client-ID>', useBinaryProtocol: false });
const chat = new ChatClient(ably);
```

You can use [basic authentication](https://ably.com/docs/auth/basic) i.e. the API Key directly for testing purposes,
however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production
environments.

To use Chat you must also set a [`clientId`](https://ably.com/docs/auth/identified-clients) so that clients are
identifiable. If you are prototyping, you can use a package like [nanoid](https://www.npmjs.com/package/nanoid) to
generate an ID.

## Getting a Room

You can get Room with name `"basketball-stream"` this way:

```ts
const room = chat.rooms.get('basketball-stream');
```

There is no need to create the room. You can start using it right away.

## Messaging

### Sending Messages

To send a message, simply call `send` on the Room's `messages` property, with the text you want to send.

```ts
const message = await room.messages.send('This was a great shot!');
```

### Message Payload

```json5
{
  timeserial: 'string',
  clientId: 'string',
  roomId: 'string',
  content: 'string',
  createdAt: 'number',
}
```

### Subscribe to incoming messages

To subscribe to incoming messages, call `subscribe` with your listener.

```ts
// Subscribe to all message events in a room
room.messages.subscribe(({ message }) => {
  console.log(message);
});
```

To unsubscribe, call `unsubscribe`, passing in the same listener you did when subscribing. Note that listeners are removed by reference equality,
so you must pass in the same reference that you subscribed.

### Query message history

The messages object also exposes the `query` method which can be used to return historical messages in the chat room, according
to the given criteria. It returns a paginated response that can be used to query for more messages.

```typescript
const historicalMessages = await room.messages.query({ direction: 'backwards', limit: 50 });
console.log(historicalMessages.items);
if (historicalMessages.hasNext()) {
  const next = await historicalMessages.next();
  console.log(next);
} else {
  console.log('End of messages');
}
```

## Connection and Ably channels statuses

You can monitor the status of the overall connection to Ably using the `connection` member of the Realtime client that you
passed into the Chat SDK, like so:

```ts
ably.connection.on('connected', (stateChange) => {
  console.log('Ably is connected');
});

ably.connection.on((stateChange) => {
  console.log('New connection state is ' + stateChange.current);
});
```

Different features in the Chat SDK often use separate channels, to give you more flexible permission control as well as more predictable scalability.
You can retrieve the channel used by each feature and listen for state events to determine the attachment status by calling the `channel` property on the feature. For example:

```ts
room.messages.channel.on('attached', (stateChange) => {
  console.log('channel ' + channel.name + ' is now attached');
});
```

You can also get the realtime channel name of the chat room by calling `name` on the underlying channel

```ts
room.messages.channel.name;
```

Note, that the SDK will automatically detach a channel whenever it isn't needed. For example if you unsubscribe all of your listeners
for room reactions, we'll automatically detach from the channel used for this purpose.

## Presence

### Get Present Members

You can get the complete list of current presence members, their state and data, by calling the get method.

```ts
// Retrieve the entire list of present members
const presentMembers = await room.presence.get();

// You can supply a clientId to retrieve the presence of a specific member with the given clientId
const presentMember = await room.presence.get({ clientId: 'client-id' });

// You can call this to get a simple boolean value of whether a member is present or not
const isPresent = await room.presence.userIsPresent('client-id');
```

Calls to `presence.get()` will return an array of the presence messages. Where each message contains the most recent
data for a member.

### Enter Presence

While entering presence, you can provide optional data that will be associated with the presence message.

```ts
await room.presence.enter({ status: 'available' });
```

### Update Presence

Updates allow you to make changes to the custom data associated with a presence user. Common use-cases include updating
the users
status or profile picture.

```ts
await room.presence.update({ status: 'busy' });
```

### Leave Presence

While leaving presence, you can provide optional data that will be associated with the presence message.

```ts
await room.presence.leave({ status: 'Be back later!' });
```

### Subscribe to presence

You can provide a single listener, if so, the listener will be subscribed to receive all presence event types.

```ts
await room.presence.subscribe((event: PresenceEvent) => {
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
await room.presence.subscribe('enter', (event: PresenceEvent) => {
  console.log(`${event.clientId} entered with data: ${event.data}`);
});

await room.presence.subscribe(['update', 'leave'], (event: PresenceEvent) => {
  console.log(`${event.clientId} updated with data: ${event.data}`);
});
```

### Unsubscribe from presence

You can unsubscribe a listener from presence events by providing the listener to the unsubscribe method.

```ts
await room.presence.unsubscribe(listener);
```

## Typing

Typing events allow you to inform others that a client is typing and also subscribe to others' typing status.

### Get Current Typers

You can get the complete set of the current typing clientIds, by calling the get method.

```ts
// Retrieve the entire list of currently typing clients
const currentlyTypingClientIds = await room.typing.get();
```

### Start Typing

To inform other users that you are typing, you can call the startTyping method. This will begin a timer that will
automatically stop typing after a set amount of time.

```ts
await room.typing.startTyping();
```

Repeated calls to startTyping will reset the timer, so the clients typing status will remain active.

```ts
await room.typing.startTyping();
// Some short delay - still typing
await room.typing.startTyping();
// Some short delay - still typing
await room.typing.startTyping();
// Some long delay - timer expires, stopped typing event emitted and listeners are notified
```

### Stop Typing

You can immediately stop typing without waiting for the timer to expire.

```ts
await room.typing.startTyping();
// Some short delay - timer not yet expired
await room.typing.stopTyping();
// Timer cleared and stopped typing event emitted and listeners are notified
```

### Subscribe To Typing

You can provide a single listener, if so, the listener will be subscribed to receive all typing event types.

```ts
await room.typing.subscribe((event) => {
  console.log(event);
});
```

You can also provide a specific event type or types to subscribe to along with a listener.

```ts
await room.typing.subscribe('startedTyping', (event) => {
  console.log(event);
});
```

### Unsubscribe From Typing

You can unsubscribe a listener from typing events by providing the listener to the unsubscribe method.

```ts
await room.typing.unsubscribe(listener);
```

## Occupancy

Using Occupancy, you can subscribe to regular updates regarding how many users are in the chat room.

### Subscribe to Occupancy Updates

To subscribe to occupancy updates, subscribe a listener to the chat rooms `occupancy` member:

```ts
const occupancyListener = (event) => {
  console.log(event);
};

await room.occupancy.subscribe(occupancyListener);
```

To unsubscribe, call `unsubscribe:

```ts
await room.occupancy.unsubscribe(occupancyListener);
```

Occupancy updates are delivered in near-real-time, with updates in quick succession batched together for performance.

### Query Instant Occupancy

To get an on-the-spot occupancy metric without subscribing to updates, you can call the `get` member:

```ts
const occupancy = await room.occupancy.get();
```

## Room-level reactions

You can subscribe to and send ephemeral room-level reactions by using the `room.reactions` objects.

### Send a reaction

To send a reaction such as `"like"`:

```ts
await room.reactions.send('like');
```

You can also add any metadata to reactions:

```ts
await room.reactions.send('like', { effect: 'fireworks' });
```

### Subscribe to reactions

Subscribe to receive room-level reactions:

```ts
const listener = (reaction) => {
  console.log('received a', reaction.type, 'with metadata', reaction.metadata);
};

await room.reactions.subscribe(listener);
```

### Unsubscribe from reactions

If previously subscribed with `listener`, to unsubscribe use

```ts
await room.reactions.unsubscribe(listener);
```

## Observing Connections to the Chat Room

You can use the types and methods on the underlying `ably-js` library to observe client connectivity to the chat room.

## Connection

The Chat SDK uses a single connection to Ably, which is exposed via the `ChatClient.connection` property. You can use this
property to observe the connection state and take action accordingly:

```ts
chatClient.connection.on((change) => {
  // Perform some action based on the current connection state,
  // such as showing or hiding a connection warning
});
```

Alternatively, if you want to listen to particular connection events:

```ts
chatClient.connection.on('connected', (change) => {
  // Connection successful
});
```

## Channels Behind Chat Features

Each feature is backed by an underlying Pub/Sub channel. The channel for each feature can be obtained via the `channel` property
on that feature, for example, for messages:

```ts
const room = chatClient.rooms.get('my-room');
const messagesChannel = room.messages.channel;
```

### Channels Used

For a given chat room, the channels used for features are as follows:

| Feature           | Channel                              |
| ----------------- | ------------------------------------ |
| Messages          | `<roomId>::$chat::$chatMessages`     |
| Presence          | `<roomId>::$chat::$chatMessages`     |
| Occupancy         | `<roomId>::$chat::$chatMessages`     |
| Reactions         | `<roomId>::$chat::$reactions`        |
| Typing            | `<roomId>::$chat::$typingIndicators` |

### Monitoring Attachment

You can then use the channel to monitor the channels attachment status:

```ts
messagesChannel.on((stateChange) => {
  // Perform some action in response to the channel state changing
});
```

Or to listen for the channel entering a specific state:

```ts
messagesChannel.on('attached', (stateChange) => {
  // Perform some action in response to the channel entering the attached state
});
```
