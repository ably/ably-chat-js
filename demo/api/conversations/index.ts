import * as dotenv from 'dotenv';
import * as Ably from 'ably/promises';
import { ulid } from 'ulidx';
import express, { Router } from 'express';
import serverless from 'serverless-http';

dotenv.config();

const messages = [];

const api = express();

const router = Router();
router.post('/conversations/:conversationId/messages', (req, res) => {
  const conversationId = req.params.conversationId;
  const ablyToken = req.headers.authorization.split(' ')[1];

  const message = {
    id: ulid(),
    ...JSON.parse(req.body),
    client_id: req.headers['ably-clientid'],
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

  const client = new Ably.Rest(ablyToken);

  client.channels.get(`conversations:${conversationId}`).publish('message.created', message);

  res.json({ id: message.id });

  res.status(201).end();
});

router.get('/conversations/:conversationId/messages', (req, res) => {
  res.json(messages);
});

api.use('/api/conversations/v1', router);

export const handler = serverless(api);
