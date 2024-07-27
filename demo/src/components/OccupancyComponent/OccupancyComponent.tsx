import { FC } from 'react';
import { useOccupancy } from '../../hooks/useOccupancy.ts';
import './OccupancyComponent.css';
import { useChatConnection } from '@ably/chat/react';

/**
 * Displays the occupancy metrics of the current room.
 */
export const OccupancyComponent: FC = () => {
  const { occupancyMetrics } = useOccupancy();
  const { currentStatus } = useChatConnection();

  if (currentStatus !== 'connected') {
    return <div>Connecting...</div>;
  }

  return (
    <div className="container p-5 sm:p-12 w-full ">
      <div className="occupancy-counts w-full flex flex-col items-center ">
        <img
          src="/connected-persons-triangle-svgrepo-com.svg"
          title="Connections metric in occupancy counts all connections, which includes, but is not limited to, users in presence"
          alt=""
        />
        <span>Occupancy Metrics</span>
        <table>
          <tbody>
            <tr>
              <td>Connected Users:</td>
              <td>{occupancyMetrics.connections}</td>
            </tr>
            <tr>
              <td>Present Users:</td>
              <td>{occupancyMetrics.presenceMembers}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
