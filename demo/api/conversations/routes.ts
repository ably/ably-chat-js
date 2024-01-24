import { Router } from 'express';
import {
  handleCreateMessage,
  handleDeleteMessages,
  handleEditMessages,
  handleQueryMessages,
} from './controllers/messagesController';
import { handleCreateConversation, handleGetConversation } from './controllers/conversationsController';
import { handleAddReaction, handleDeleteReaction } from './controllers/reactionsController';

const router = Router();

// Conversations

router.post('/conversations/:conversationId', handleCreateConversation);

router.get('/conversations/:conversationId', handleGetConversation);

// Messages

router.post('/conversations/:conversationId/messages', handleCreateMessage);

router.get('/conversations/:conversationId/messages', handleQueryMessages);

router.post('/conversations/:conversationId/messages/:messageId', handleEditMessages);

router.delete('/conversations/:conversationId/messages/:messageId', handleDeleteMessages);

// Reactions

router.post('/conversations/:conversationId/messages/:messageId/reactions', handleAddReaction);

router.delete('/reactions/:reactionId', handleDeleteReaction);

export { router };
