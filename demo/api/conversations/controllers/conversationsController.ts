import { Request, Response } from 'express';
import { createConversation, getConversation } from '../inMemoryDb';

export const handleCreateConversation = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  res.json(createConversation(conversationId));
};

export const handleGetConversation = (req: Request, res: Response) => {
  const conversationId = req.params.conversationId;
  res.json(getConversation(conversationId));
};
