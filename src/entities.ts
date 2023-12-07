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
  type: string;
  client_id: string;
  updated_at: number | null;
  deleted_at: number | null;
}
