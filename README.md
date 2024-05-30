# Ably Chat SDK

The **Chat SDK** offers a seamless and customizable API designed to facilitate diverse
in-app conversations scenarios, encompassing live comments, in-app chat functionalities,
and the management of real-time updates and user interactions.

## Prerequisites

To start using this SDK, you will need the following:

* An Ably account
    * You can [sign up](https://ably.com/signup) to the generous free tier.
* An Ably API key
    * Use the default or create a new API key in an app within
      your [Ably account dashboard](https://ably.com/dashboard).
    * Make sure your API key has the
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
import Chat from '@ably/chat';
import * as Ably from 'ably';

const ably = new Ably.Realtime({ key: "<API-key>", clientId: "<client-ID>", useBinaryProtocol: false });
const chat = new Chat(ably);
```

You can use [basic authentication](https://ably.com/docs/auth/basic) i.e. the API Key directly for testing purposes,
however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production
environments.

To use Chat you must also set a [`clientId`](https://ably.com/docs/auth/identified-clients) so that clients are
identifiable. If you are prototyping, you can use a package like [nanoid](https://www.npmjs.com/package/nanoid) to
generate an ID.

## Getting a Room

You can get Room with name `"abc"` this way:

```ts
const room = chat.rooms.get("abc");
```

There is no need to create the room. You can start using it right away.

## Messaging

Get window of messages:

```ts
const messages = await room.messages.query({
  limit,
  from,
  to,
  direction,
})
```

Send messages:

```ts
const message = await room.messages.send("hello")
```

### Message Object

```json5
{
  "timeserial": "string",
  "clientId": "string",
  "roomId": "string",
  "content": "string",
  "createdAt": "number",
}

```

### Subscribe to messages

```ts
// Subscribe to all message events in a room
room.messages.subscribe(({ type, message }) => {
  switch (type) {
    case 'message.created':
      console.log(message);
      break;
  }
});
```

Or

```ts
// Subscribe to specific event in a room
room.messages.subscribe('message.created', ({ type, message }) => {
  console.log(message);
});
```

### Subscribe and fetch latest messages

Common use-case for Messages is getting latest messages and subscribe to future updates, to make it easier,
you can use `fetch` option:

```ts
room.messages.subscribe(({ type, message, ...restEventsPayload }) => {
  switch (type) {
    case 'message.created':
      // last messages will come as  message.created event
      console.log(message);
      break;
    default:
      console.log(type, restEventsPayload);
  }
}, {
  fetch: {
    limit
  }
});
```

## Connection and Ably channels statuses

The Room object exposes `channel` and `connection` fields, which implements `EventEmitter` interface,
you can register a channel and connection state change listener with the on() or once() methods,
depending on whether you want to monitor all state changes, or only the first occurrence of one.

```ts
room.connection.on('connected', (stateChange) => {
  console.log('Ably is connected');
});

room.connection.on((stateChange) => {
  console.log('New connection state is ' + stateChange.current);
});

room.channel.on('attached', (stateChange) => {
  console.log('channel ' + channel.name + ' is now attached');
});
```

You can also get the realtime channel name of the chat room with

```ts
room.channelName
```

## Presence

### Get Present Members

You can get the complete list of current presence members, their state and data, by calling the get method.

```ts
import { PresenceMember } from './Presence';
// Retrieve the entire list of present members
const presentMembers: PresenceMember[] = await room.presence.get()

// You can supply a clientId to retrieve the presence of a specific member with the given clientId
const presentMember: PresenceMember[] = await room.presence.get({ clientId: 'client-id' })

// You can call this to get a simple boolean value of whether a member is present or not
const isPresent: boolean = await room.presence.userIsPresent('client-id')
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
await room.presence.enter({ status: 'busy' });
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
