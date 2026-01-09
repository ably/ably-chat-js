# Chat SDK Demo

An app showcasing the usage of Chat SDK with Chat React hooks to build chat.

Quickstart install-to-browser, from this folder run:

```
(cd .. && npm run build)
npm install
npm run start
```

## Installation

> [!NOTE]
> This demo app uses both the `ably-chat-js` core SDK and associated React hooks.
> This is accessible via `@ably/chat`.

1. First of all, you need to build the main Chat SDK and associated React hooks from the root directory (`(cd .. && npm run build)`).
2. Run `npm install` here.

## Credential Setup

1. Copy `.env.example` to `.env.` and set the `VITE_ABLY_CHAT_API_KEY` to your Ably API key.
2. If you're using a custom Ably domain, also set the `VITE_ABLY_HOST` to your custom domain.

For Ably: if running local realtime, see [`src/main.tsx`](./src/main.tsx).

## Running

Run `npm run start`.

## Server-side token generation

This demo app configures a vite plugin to handle the `/api/ably-token-request` request. The handler is defined in `server/token-handler.ts`.