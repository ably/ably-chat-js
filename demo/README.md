# Chat SDK Demo

An app showcasing the usage of Chat SDK to build chat.

Quickstart install-to-browser, from this folder run:

```
(cd .. && npm run build)
npm install
npm run start
```

## Installation

1. First of all, you need to build the main Chat SDK from the root directory (`(cd .. && npm run build)`).
2. Run `npm install` here.

## Credential Setup

1. Copy `.env.example` to `.env.` and set the `VITE_ABLY_CHAT_API_KEY` to your Ably API key.
2. If you're using a custom Ably domain, also set the `VITE_ABLY_HOST` to your custom domain.

For Ably: if running local realtime, see `src/main.tsx`.

## Running

Run `npm run start`, and it will automatically open your browser on port 8888.

Use `npm run start-silent` if you'd rather not have your browser open automatically.

`npm run start` (and the `start-silent` version) will run both the API component for generating tokens and the front-end side. If you'd like to only run the front-end site use `npm run dev`.