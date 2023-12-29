import { ulid } from 'ulidx';

export interface Conversation {
  id: string;
  application_id: string;
  ttl: number | null;
  created_at: number;
}

export interface Message {
  id: string;
  client_id: string;
  conversation_id: string;
  content: string;
  reactions: {
    counts: Record<string, number>;
    latest: Reaction[];
    mine: Reaction[];
  };
  created_at: number;
  updated_at: number | null;
  deleted_at: number | null;
}

export interface Reaction {
  id: string;
  message_id: string;
  conversation_id: string;
  type: string;
  client_id: string;
  updated_at: number | null;
  deleted_at: number | null;
}

const conversations: Conversation[] = [];
const conversationIdToMessages: Record<string, Message[]> = {};
const reactions: Reaction[] = [];

export const createConversation = (id: string): Conversation => {
  const existing = conversations.find((conv) => conv.id === id);
  if (existing) return existing;
  const conversation = {
    id,
    application_id: 'demo',
    ttl: null,
    created_at: Date.now(),
  };
  conversationIdToMessages[id] = [];
  conversations.push(conversation);
  return conversation;
};

createConversation('conversation1');

export const getConversation = (id: string): Conversation => {
  return conversations.find((conv) => conv.id === id);
};

export const findMessages = (conversationId: string, clientId: string) =>
  enrichMessagesWithReactions(conversationIdToMessages[conversationId], clientId);

export const createMessage = (message: Pick<Message, 'client_id' | 'conversation_id' | 'content'>) => {
  const created: Message = {
    ...message,
    id: ulid(),
    reactions: {
      counts: {},
      latest: [],
      mine: [],
    },
    created_at: Date.now(),
    updated_at: null,
    deleted_at: null,
  };
  conversationIdToMessages[created.conversation_id].push(created);
  return created;
};

export const editMessage = (message: Pick<Message, 'id' | 'conversation_id' | 'content'>) => {
  const edited = conversationIdToMessages[message.conversation_id].find(({ id }) => message.id === id);
  edited.content = message.content;
  return edited;
};

export const deleteMessage = (message: Pick<Message, 'id' | 'conversation_id'>) => {
  const deletedIndex = conversationIdToMessages[message.conversation_id].findIndex(({ id }) => message.id === id);
  const deleted = conversationIdToMessages[message.conversation_id][deletedIndex];
  conversationIdToMessages[message.conversation_id].splice(deletedIndex, 1);
  return deleted;
};

export const addReaction = (
  reaction: Pick<Reaction, 'id' | 'message_id' | 'type' | 'client_id' | 'conversation_id'>,
) => {
  const created: Reaction = {
    ...reaction,
    id: ulid(),
    updated_at: null,
    deleted_at: null,
  };
  reactions.push(created);
  return created;
};

export const deleteReaction = (reactionId: string) => {
  const deletedIndex = reactions.findIndex((reaction) => reaction.id === reactionId);
  const deleted = reactions[deletedIndex];
  reactions.splice(deletedIndex, 1);
  return deleted;
};

const enrichMessageWithReactions = (message: Message, clientId: string): Message => {
  const messageReactions = reactions.filter((reaction) => reaction.message_id === message.id);
  const mine = messageReactions.filter((reaction) => reaction.client_id === clientId);
  const counts = messageReactions.reduce(
    (acc, reaction) => {
      if (acc[reaction.type]) {
        acc[reaction.type]++;
      } else {
        acc[reaction.type] = 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );
  return {
    ...message,
    reactions: {
      counts,
      latest: messageReactions,
      mine,
    },
  };
};

const enrichMessagesWithReactions = (messages: Message[], clientId: string) => {
  return messages.map((message) => enrichMessageWithReactions(message, clientId));
};
