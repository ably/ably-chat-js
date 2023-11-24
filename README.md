# Ably Chat SDK

The **Chat SDK** offers a seamless and customizable API designed to facilitate diverse 
in-app conversations scenarios, encompassing live comments, in-app chat functionalities, 
and the management of real-time updates and user interactions.

## Prerequisites

To start using this SDK, you will need the following:

* An Ably account
    * You can [sign up](https://ably.com/signup) to the generous free tier.
* An Ably API key
    * Use the default or create a new API key in an app within your [Ably account dashboard](https://ably.com/dashboard).
    * Make sure your API key has the following [capabilities](https://ably.com/docs/auth/capabilities): `publish`, `subscribe`, `presence` and `history`.


## Installation and authentication

Install the Ably JavaScript SDK and the Chat SDK:

```sh
npm install ably @ably/chat
```

To instantiate the Chat SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the Chat constructor:

```ts
import Chat from '@ably/chat';
import { Realtime } from 'ably';

const ably = new Realtime.Promise({ key: "<API-key>", clientId: "<client-ID>" });
const client = new Chat(ably);
```
You can use [basic authentication](https://ably.com/docs/auth/basic) i.e. the API Key directly for testing purposes, however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production environments.

To use Chat you must also set a [`clientId`](https://ably.com/docs/auth/identified-clients) so that clients are identifiable. If you are prototyping, you can use a package like [nanoid](https://www.npmjs.com/package/nanoid) to generate an ID.


## Creating a new Room

A Room is a chat between one or more participants that may be backed by one or more Ably PubSub channels.

```ts
const room = await client.create(`namespace:${entityId}`);
```

## Getting existing Room

You can connect to the existing room by its name:

```ts
const room = await client.get(`namespace:${entityId}`);
```

Also you can send `createIfNotExists: true` option that will create new Room if it doesn't exist.

```ts
const room = await client.get(`namespace:${entityId}`, { createIfNotExists: true });
```

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
const message = await room.messages.publishMessage({
  text
})
```

Update message:

```ts
const message = await room.messages.editMessage(msgId, {
  text
})
```

Delete message:

```ts
await room.messages.removeMessage(msgId)
```

## Reactions

Add reaction:

```ts
const reaction = await room.messages.addReaction(msgId, {
  type,
  ...
})
```

Delete reaction:

```ts
await room.messages.removeReaction(msgId, type)
```

### Subscribe to message changes

```ts
// Subscribe to all message events in a room
room.messages.subscribe(({ type, message, reaction, diff, messageId, reactionId, deletedAt }) => {
    switch (type) {
      case 'message.created':
        console.log(message);
        break;
      case 'message.updated':
        console.log(diff);
        break;
      case 'message.deleted':
        console.log(messageId);
        break;
      case 'reaction.added':
        console.log(reaction);
        break;
      case 'reaction.deleted':
        console.log(reactionId);
        break;
    }
});
```

```ts
// Subscribe to specific even in a room
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

[//]: # (TODO message statuses updates: sent, delivered, read)

## Presence

> [!IMPORTANT]  
> Idea is to keep it similar to Spaces members and potentially reuse code 

```ts
// Enter a room, publishing an update event, including optional profile data
await room.enter({
  username: 'Claire Lemons',
  avatar: 'https://slides-internal.com/users/clemons.png',
});
```

```ts
// Subscribe to all member events in a room
room.members.subscribe((memberUpdate) => {
  console.log(memberUpdate);
});

// Subscribe to member enter events only
room.members.subscribe('enter', (memberJoined) => {
  console.log(memberJoined);
});

// Subscribe to member leave events only
room.members.subscribe('leave', (memberLeft) => {
  console.log(memberLeft);
});

// Subscribe to member remove events only
room.members.subscribe('remove', (memberRemoved) => {
  console.log(memberRemoved);
});

// Subscribe to profile updates on members only
room.members.subscribe('updateProfile', (memberProfileUpdated) => {
  console.log(memberProfileUpdated);
});
```

### Getting a snapshot of members

Members has methods to get the current snapshot of member state:

```ts
// Get all members in a room
const allMembers = await room.members.getAll();

// Get your own member object
const myMemberInfo = await room.members.getSelf();

// Get everyone else's member object but yourself
const othersMemberInfo = await room.members.getOthers();
```

## Typing indicator

This function should be invoked on each keypress on the input field

```ts
room.typing.type()
```

This function should be triggered when the user exits the input field focus.

```ts
room.typing.stop()
```

Subscribe to typing events:

```ts
room.messages.subscribe(({ type, member }) => {
  switch (type) {
    case 'typings.typed':
    case 'typings.stopped':
      console.log(member);
      break;
  }
});
```

## Connection and Ably channels statuses

Conversation exposes `channel` and `connection` fields, which implements `EventEmitter` interface,
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
