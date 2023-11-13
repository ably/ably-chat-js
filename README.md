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

To use Spaces you must also set a [`clientId`](https://ably.com/docs/auth/identified-clients) so that clients are identifiable. If you are prototyping, you can use a package like [nanoid](https://www.npmjs.com/package/nanoid) to generate an ID.


## Creating a new Conversation

A Conversation is a chat between one or more participants that may be backed by one or more Ably PubSub channels.

```ts
const conversation = await client.create(`namespace:${entityId}`);
```

## Listen to changes

### Listen to all changes

```ts
conversation.subscribe('update', (data) => {
  // members are online, currently active users of the conversation
  console.log(data.members);
  // user-defined state of cnversations, can hold conversation name, image, description, etc.
  console.log(data.details);
});
```

## Messaging

Get window of messages:

```ts
const messages = await conversation.messages.query({
  limit,
  from,
  to,
})
```

Send messages:

```ts
const message = await conversation.messages.publishMessage({
  text
})
```

Update message:

```ts
const message = await conversation.messages.editMessage(msgId, {
  text
})
```

Delete message:

```ts
await conversation.messages.removeMessage(msgId)
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
await conversation.messages.removeReaction(msgId, type)
```

### Subscribe to message changes

```ts
// Subscribe to all message events in a conversation
conversation.messages.subscribe((updatePayload) => {
  console.log(updatePayload);
});

conversation.messages.subscribe('publishMessage', (messagePublished) => {
  console.log(messagePublished);
});

conversation.messages.subscribe('editMessage', (messageEdited) => {
    console.log(messageEdited);
});

conversation.messages.subscribe('removeMessage', (messageRemoved) => {
  console.log(messageRemoved);
});

conversation.messages.subscribe('addReaction', (reactionAdded) => {
  console.log(reactionAdded);
});

conversation.messages.subscribe('addReaction', (reactionAdded) => {
  console.log(reactionAdded);
});

conversation.messages.subscribe('removeReaction', (reactionRemoved) => {
  console.log(reactionRemoved);
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

Indicate that typing is started

```ts
conversation.typing.start()
```

Indicate that typing is stopped

```ts
conversation.typing.stop()
```

Subscribe to typing events:

```ts
conversation.typing.subscribe('update', (typingUpdate) => {
  console.log(typingUpdate);
})
```
