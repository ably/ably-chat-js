import { Request, Response } from 'express';
import * as Ably from 'ably/promises';
import { addReaction, deleteReaction } from '../inMemoryDb';

export const handleAddReaction = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  const ablyToken = req.headers.authorization.split(' ')[1];

  const reaction = addReaction({
    message_id: req.params.messageId,
    conversation_id: conversationId,
    client_id: req.headers['ably-clientid'] as string,
    ...JSON.parse(req.body),
  });

  const client = new Ably.Rest(ablyToken);

  client.channels.get(`conversations:${conversationId}`).publish('reaction.added', reaction);

  res.status(201).end();
};

export const handleDeleteReaction = (req: Request, res: Response) => {
  const reactionId = req.params.reactionId;
  const ablyToken = req.headers.authorization.split(' ')[1];

  const reaction = deleteReaction(reactionId);

  const client = new Ably.Rest(ablyToken);

  client.channels.get(`conversations:${reaction.conversation_id}`).publish('reaction.deleted', reaction);

  res.status(201).end();
};
