import * as Ably from 'ably/promises';
import { Request, Response } from 'express';
import { createMessage, deleteMessage, editMessage, findMessages } from '../inMemoryDb';

export const handleCreateMessage = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  const ablyToken = req.headers.authorization.split(' ')[1];

  const message = createMessage({
    ...JSON.parse(req.body),
    client_id: req.headers['ably-clientid'] as string,
    conversation_id: conversationId,
  });

  const client = new Ably.Rest(ablyToken);

  client.channels.get(`conversations:${conversationId}`).publish('message.created', message);

  res.json({ id: message.id });

  res.status(201).end();
};

export const handleQueryMessages = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  res.json(findMessages(conversationId, req.headers['ably-clientid'] as string));
};

export const handleEditMessages = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  const ablyToken = req.headers.authorization.split(' ')[1];

  const message = editMessage({
    id: req.params.messageId,
    conversation_id: conversationId,
    ...JSON.parse(req.body),
  });

  const client = new Ably.Rest(ablyToken);

  client.channels.get(`conversations:${conversationId}`).publish('message.updated', message);

  res.json({ id: message.id });

  res.status(201).end();
};

export const handleDeleteMessages = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  const ablyToken = req.headers.authorization.split(' ')[1];

  const message = deleteMessage({
    id: req.params.messageId,
    conversation_id: conversationId,
  });

  const client = new Ably.Rest(ablyToken);

  client.channels.get(`conversations:${conversationId}`).publish('message.deleted', message);

  res.status(201).end();
};
