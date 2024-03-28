export interface Room {
  id: string;
  application_id: string;
  ttl: number | null;
  created_at: number;
}

export interface Message {
  id: string;
  created_by: string;
  room_id: string;
  content: string;
  reactions:
    | {
        counts: Record<string, number>;
        latest: Reaction[];
        mine: Reaction[];
      }
    | undefined;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
}

export interface Reaction {
  id: string;
  message_id: string;
  type: string;
  created_by: string;
}
