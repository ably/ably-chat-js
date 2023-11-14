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
