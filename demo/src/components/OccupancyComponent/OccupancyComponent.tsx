import { FC } from 'react';
import { useOccupancy } from '@ably/chat/react';

/**
 * Displays the occupancy metrics of the current room.
 */
export const OccupancyComponent: FC = () => {
  const { connections, presenceMembers } = useOccupancy();
  return (
    <div className="pb-2 mb-2 border-b border-gray-300">
      <strong className="text-green-700 mr-4 text-center">Online: {presenceMembers}</strong>
      <strong className="text-green-700 mr-4 text-center">Connected: {connections}</strong>
    </div>
  );
};
