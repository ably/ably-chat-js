import * as dotenv from 'dotenv';
import * as Ably from 'ably/promises';
import { HandlerEvent } from '@netlify/functions';
import { ulid } from 'ulidx';

dotenv.config();

const messages = [];

export async function handler(event: HandlerEvent) {
  if (!process.env.ABLY_API_KEY) {
    console.error(`
Missing ABLY_API_KEY environment variable.
If you're running locally, please ensure you have a ./.env file with a value for ABLY_API_KEY=your-key.
If you're running in Netlify, make sure you've configured env variable ABLY_API_KEY.

Please see README.md for more details on configuring your Ably API Key.`);

    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('ABLY_API_KEY is not set'),
    };
  }

  if (/\/api\/conversations\/v1\/conversations\/(\w+)\/messages/.test(event.path) && event.httpMethod === 'POST') {
    const conversationId = /\/api\/conversations\/v1\/conversations\/(\w+)\/messages/.exec(event.path)[1];
    const message = {
      id: ulid(),
      ...JSON.parse(event.body),
      client_id: event.headers['ably-clientid'],
      conversation_id: conversationId,
      reactions: {
        counts: {},
        latest: [],
        mine: [],
      },
      created_at: Date.now(),
      updated_at: null,
      deleted_at: null,
    };
    messages.push(message);

    const client = new Ably.Rest(process.env.ABLY_API_KEY);

    client.channels.get(`conversations:${conversationId}`).publish('message.created', message);

    return {
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: message.id }),
    };
  }

  const getMessagesRegEx = /\/api\/conversations\/v1\/conversations\/(\w+)\/messages/;
  if (getMessagesRegEx.test(event.path) && event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messages),
    };
  }

  return {
    statusCode: 404,
    body: 'Not Found',
  };
}
