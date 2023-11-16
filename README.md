# Ably Conversations SDK

The **Conversations SDK** offers a seamless and customizable API designed to facilitate diverse 
in-app conversation scenarios, encompassing live comments, in-app chat functionalities, 
and the management of real-time updates and user interactions.

## Prerequisites

To start using this SDK, you will need the following:

* An Ably account
    * You can [sign up](https://ably.com/signup) to the generous free tier.
* An Ably API key
    * Use the default or create a new API key in an app within your [Ably account dashboard](https://ably.com/dashboard).
    * Make sure your API key has the following [capabilities](https://ably.com/docs/auth/capabilities): `publish`, `subscribe`, `presence` and `history`.


## Installation and authentication

Install the Ably JavaScript SDK and the Conversations SDK:

```sh
npm install ably @ably/conversations
```

To instantiate the Conversations SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the Conversations constructor:

```ts
import Conversations from '@ably/conversations';
import { Realtime } from 'ably';

const ably = new Realtime.Promise({ key: "<API-key>", clientId: "<client-ID>" });
const client = new Conversations(ably);
```
You can use [basic authentication](https://ably.com/docs/auth/basic) i.e. the API Key directly for testing purposes, however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production environments.

To use Conversations you must also set a [`clientId`](https://ably.com/docs/auth/identified-clients) so that clients are identifiable. If you are prototyping, you can use a package like [nanoid](https://www.npmjs.com/package/nanoid) to generate an ID.


## Creating a new Conversation

A Conversation is a chat between one or more participants that may be backed by one or more Ably PubSub channels.

```ts
const conversation = await client.create(`namespace:${entityId}`);
```

## Listen to changes

### Listen to all changes

```ts
conversation.subscribe(({ type, ...payload }) => {
  switch (type) {
    case 'message.created':
    case 'message.updated':
    case 'message.deleted':
      console.log('messages event', payload);
      break;
    case 'reaction.added':
    case 'reaction.deleted':
      console.log('messages event', payload);
      break;
    case 'members.enter':
    case 'members.leave':
    case 'members.remove':
    case 'members.updateProfile':
      console.log('members event', payload);
      break;
    case 'typings.typed':
    case 'typings.stopped':
      console.log('members event', payload);
      break;
  }
});
```

## Messaging

Get window of messages:

```ts
const messages: Message[] = await conversation.messages.query({
  limit,
  from,
  to,
  direction,
})
```

where `Message` is

```ts
class Message {
    
    getState(): MessageState
    
    update(diff: MessageUpdate)

    addReaction(reaction: Reaction)
  
    removeReaction(type: string)
}
```

Send messages:

```ts
const message = await conversation.messages.publishMessage({
  text
})
```


Update message:

```ts
message.update({ text })
```

Delete message:

```ts
conversation.messages.delete(msgId)
```

## Reactions

Add reaction:

```ts
message.addReaction({
  type,
  ...
})
```

Delete reaction:

```ts
message.removeReaction(type)
```

### Subscribe to message changes

```ts
// Subscribe to all message events in a conversation
conversation.messages.subscribe(({ type, message, reaction, diff, messageId, reactionId, deletedAt }) => {
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

[//]: # (TODO message statuses updates: sent, delivered, read)

## Presence

> [!IMPORTANT]  
> Idea is to keep it similar to Spaces members and potentially reuse code 

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

// Subscribe to member remove events only
conversation.members.subscribe('remove', (memberRemoved) => {
  console.log(memberRemoved);
});

// Subscribe to profile updates on members only
conversation.members.subscribe('updateProfile', (memberProfileUpdated) => {
  console.log(memberProfileUpdated);
});

// Subscribe to all updates to members
conversation.members.subscribe('update', (memberUpdate) => {
  console.log(memberUpdate);
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
