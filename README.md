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

**React**: The library ships with a number of providers and hooks for React, which provide a closer integration with that ecosystem.

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

## Prerequisites

You will need the following prerequisites:

- An Ably account
  - You can [sign up](https://ably.com/signup) to the generous free tier.
- An Ably API key
  - Use the default or create a new API key in an app within
    your [Ably account dashboard](https://ably.com/dashboard).
  - Make sure your API key has the
    following [capabilities](https://ably.com/docs/auth/capabilities): `publish`, `subscribe`, `presence`, `history` and `channel-metadata`.

## Installation

The Chat SDK can be installed either from NPM, or included directly from Ably's CDN.

### npm

```sh
npm install @ably/chat
```

### CDN

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

The Ably client library follows [Semantic Versioning](http://semver.org/). To lock into a major or minor version of the client library, you can specify a specific version number such as https://cdn.ably.com/lib/ably-chat-0.js for all v0._ versions, or https://cdn.ably.com/lib/ably-chat-0.1.js for all v0.1._ versions, or you can lock into a single release with https://cdn.ably.com/lib/ably-chat-0.1.0.js. See https://github.com/ably/ably-chat-js/tags for a list of tagged releases.

## Contributing

For guidance on how to contribute to this project, see the [contributing guidelines](CONTRIBUTING.md).

## Support, feedback and troubleshooting

Please visit http://support.ably.com/ for access to our knowledge base and to ask for any assistance. You can also view the [community reported Github issues](https://github.com/ably/ably-chat-js/issues) or raise one yourself.

To see what has changed in recent versions, see the [changelog](CHANGELOG.md).

## Further reading

- See a [simple chat example](/demo/) in this repo.
- Play with the [livestream chat demo](https://ably-livestream-chat-demo.vercel.app/).
- [Share feedback or request](https://forms.gle/mBw9M53NYuCBLFpMA) a new feature.
