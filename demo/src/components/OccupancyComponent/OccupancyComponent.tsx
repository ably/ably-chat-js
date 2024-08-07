import { FC } from 'react';
import { useOccupancy } from '@ably/chat/react';
import './OccupancyComponent.css';

/**
 * Displays the occupancy metrics of the current room.
 */
export const OccupancyComponent: FC = () => {
  const { connections, presenceMembers } = useOccupancy();

  return (
    <div className="p-5 sm:p-12 w-full ">
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
              <td>{connections}</td>
            </tr>
            <tr>
              <td>Present Users:</td>
              <td>{presenceMembers}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
