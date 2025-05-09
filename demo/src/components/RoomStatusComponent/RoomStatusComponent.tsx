import { useState, KeyboardEvent, ChangeEvent, useEffect } from 'react';
import { useRoom } from '@ably/chat/react';
import { RoomStatus } from '@ably/chat';

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  [RoomStatus.Attaching]: { text: 'Attaching...', color: 'text-blue-500' },
  [RoomStatus.Detached]: { text: 'Detached - will retry to connect automatically', color: 'text-yellow-800' },
  [RoomStatus.Suspended]: { text: 'Room suspended - will retry to connect automatically', color: 'text-yellow-800' },
  [RoomStatus.Failed]: { text: 'Room connection failed. Refresh the page to try again.', color: 'text-red-800' },
  [RoomStatus.Attached]: { text: 'Attached', color: 'text-green-800' },
  [RoomStatus.Initializing]: { text: 'Initializing...', color: 'text-blue-500' },
  [RoomStatus.Initialized]: { text: 'Initialized', color: 'text-blue-500' },
  [RoomStatus.Detaching]: { text: 'Detaching...', color: 'text-blue-500' },
  [RoomStatus.Releasing]: { text: 'Releasing...', color: 'text-blue-500' },
  [RoomStatus.Released]: { text: 'Released', color: 'text-yellow-800' },
};

interface RoomStatusComponentProps {
  updateRoomId?: (newRoomId: string) => void;
}

export function RoomStatusComponent({ updateRoomId }: RoomStatusComponentProps) {
  const [roomStatus, setRoomStatus] = useState('');
  const { roomId } = useRoom({
    onStatusChange: (status) => setRoomStatus(status.current),
  });
  const [editableRoomId, setEditableRoomId] = useState(roomId);

  const handleRoomIdChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditableRoomId(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && updateRoomId) {
      updateRoomId(editableRoomId);
    }
  };

  // Update the editable room ID when the actual room ID changes
  useEffect(() => {
    setEditableRoomId(roomId);
  }, [roomId]);

  const { text: statusText = 'Unknown', color: statusColor = 'text-gray-500' } = STATUS_MAP[roomStatus] || {};

  return (
    <div className="p-4 text-left h-full border border-gray-300 bg-gray-100 rounded shadow-sm">
      <h2 className="text-lg text-center font-semibold text-blue-500 pb-2 border-b border-gray-200">Room Status</h2>
      <div className="mt-3 text-black">
        <div className="flex items-baseline mb-1">
          <span className="w-20">Status:</span>
          <span className={statusColor}>{statusText}</span>
        </div>
        <div className="flex items-center">
          <span className="w-20">Room:</span>
          <input
            type="text"
            value={editableRoomId}
            onChange={handleRoomIdChange}
            onKeyDown={handleKeyDown}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-blue-300 transition-colors"
            placeholder="Enter room ID"
          />
        </div>
      </div>
    </div>
  );
}
