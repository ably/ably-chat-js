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


## Getting Conversation controller

You can get conversation controller:

```ts
const conversation = client.conversations.get(conversationId);
```

## Create a Conversation

You can create conversation using controller:

```ts
await conversation.create({ ttl });
```

## Messaging

Get window of messages:

```ts
const messages = await conversation.messages.query({
  limit,
  from,
  to,
  direction,
})
```

Send messages:

```ts
const message = await conversation.messages.send({
  text
})
```

Update message:

```ts
const message = await conversation.messages.edit(msgId, {
  text
})
```

Delete message:

```ts
await conversation.messages.delete(msgId)
await conversation.messages.delete(msg)
```

### Message Object

```json5
{
  "id": "string",
  "client_id": "string",
  "conversation_id": "string",
  "content": "string",
  "reactions": {
    "counts": {
      "like": "number",
      "heart": "number",
    },
    "latest": [
      // List of most recent reactions
    ],
    "mine": [
      // List of Reaction objects
    ]
  },
  "created_at": "number",
  "updated_at": "number|null",
  "deleted_at": "number|null"
}

```

## Reactions

Add reaction:

```ts
const reaction = await conversation.messages.addReaction(msgId, {
  type,
  ...
})
```

Delete reaction:

```ts
await conversation.messages.removeReaction(reactionId)
```

### Reaction object

```json5
{
  "id": "string",
  "message_id": "string",
  "type": "string",
  "client_id": "string",
  "updated_at": "number|null",
  "deleted_at": "number|null"
}
```

### Subscribe to message changes

```ts
// Subscribe to all message events in a conversation
conversation.messages.subscribe(({ type, message }) => {
    switch (type) {
      case 'message.created':
        console.log(message);
        break;
      case 'message.updated':
        console.log(message);
        break;
      case 'message.deleted':
        console.log(message);
        break;
    }
});
```

### Subscribe to reactions

```ts
// Subscribe to all reactions
conversation.messages.subscribeReactions(({ type, reaction }) => {
    switch (type) {
      case 'reaction.added':
        console.log(reaction);
        break;
      case 'reaction.deleted':
        console.log(reaction);
        break;
    }
});
```

```ts
// Subscribe to specific even in a conversation
conversation.messages.subscribe('message.created', ({ type, message }) => {
  console.log(message);
});
```

### Subscribe and fetch latest messages

Common use-case for Messages is getting latest messages and subscribe to future updates, to make it easier,
you can use `fetch` option:

```ts
conversation.messages.subscribe(({ type, message, ...restEventsPayload }) => {
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
// Enter a conversation, publishing an update event, including optional profile data
await conversation.enter({
  username: 'Claire Lemons',
  avatar: 'https://slides-internal.com/users/clemons.png',
});
```

```ts
// Subscribe to all member events in a conversation
conversation.members.subscribe((memberUpdate) => {
  console.log(memberUpdate);
});

// Subscribe to member enter events only
conversation.members.subscribe('enter', (memberJoined) => {
  console.log(memberJoined);
});

// Subscribe to member leave events only
conversation.members.subscribe('leave', (memberLeft) => {
  console.log(memberLeft);
});

// Subscribe to member update events only
conversation.members.subscribe('update', (memberRemoved) => {
  console.log(memberRemoved);
});
```

### Getting a snapshot of members

Members has methods to get the current snapshot of member state:

```ts
// Get all members in a conversation
const allMembers = await conversation.members.getAll();

// Get your own member object
const myMemberInfo = await conversation.members.getSelf();

// Get everyone else's member object but yourself
const othersMemberInfo = await conversation.members.getOthers();
```

## Conversation reactions

Get reactions

```ts
conversation.reactions.get()
```

Subscribe to reactions updates

```ts
conversation.reactions.subscribe(({ type, reaction }) => {
  switch (type) {
    case "reaction.added":
    case "reaction.deleted":
      console.log(reaction);
      break;
  }
});
```

Add reaction

```ts
conversation.reactions.add(reactionType)
```

Remove reaction

```ts
conversation.reactions.delete(reactionId)
```

## Typing indicator

This function should be invoked on each keypress on the input field

```ts
conversation.typing.type()
```

This function should be triggered when the user exits the input field focus.

```ts
conversation.typing.stop()
```

Subscribe to typing events:

```ts
conversation.messages.subscribe(({ type, member }) => {
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
conversation.connection.on('connected', (stateChange) => {
    console.log('Ably is connected');
});

conversation.connection.on((stateChange) => {
  console.log('New connection state is ' + stateChange.current);
});

conversation.channel.on('attached', (stateChange) => {
  console.log('channel ' + channel.name + ' is now attached');
});
```
