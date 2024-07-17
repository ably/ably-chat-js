import * as Chat from '@ably/chat';
import { PresenceMember } from '@ably/chat';
import { useCallback, useEffect, useState } from 'react';
import { useRoom } from './useRoom.ts';

export const usePresence = () => {
  const [presenceMembers, setPresenceMembers] = useState<PresenceMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [present, setPresent] = useState<boolean>(false);
  const { room } = useRoom();

  useEffect(() => {
    if (!room) return;
    room.presence.get().then((members) => {
      setPresenceMembers(members);
    });
    const { unsubscribe } = room.presence.subscribe(() => {
      room.presence.get().then((members) => {
        setPresenceMembers(members);
      });
    });
    setLoading(false);
    return () => {
      // cleanup after the component is unmounted
      unsubscribe();
    };
  }, [room]);

  const enterPresence = useCallback(
    (data?: Chat.PresenceData) => {
      return room.presence.enter(data).then(() => setPresent(true));
    },
    [room],
  );

  const leavePresence = useCallback(
    (data?: Chat.PresenceData) => {
      return room.presence.leave(data).then(() => {
        setPresent(false);
      });
    },
    [room],
  );
  const updatePresence = useCallback(
    (data?: Chat.PresenceData) => {
      return room.presence.update(data).then(() => {
        setPresent(true);
      });
    },
    [room],
  );

  return {
    enterPresence,
    leavePresence,
    updatePresence,
    presenceMembers,
    present,
    loading,
  };
};
