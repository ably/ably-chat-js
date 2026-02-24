import { FC } from 'react';
import { PresenceMember } from '@ably/chat';
import { useChatClient, usePresence, usePresenceListener } from '@ably/chat/react';
import { displayNameFromClaim } from '../../display-name.js';

interface UserListComponentProps {}

export const UserPresenceComponent: FC<UserListComponentProps> = () => {
  const { myPresenceState } = usePresence({ initialData: { status: '💻 Online' } });
  const { presenceData } = usePresenceListener({
    listener: (event: unknown) => {
      console.log('Presence data changed', { event });
    },
  });

  const { clientId } = useChatClient();

  const renderPresentMember = (presentMember: PresenceMember, index: number) => {
    let status: string;
    const data = presentMember.data as { status: string };
    const name = displayNameFromClaim(presentMember.userClaim, presentMember.clientId);
    if (presentMember.clientId === clientId) {
      status = `👤 You (${name}) - ${data.status}`;
    } else {
      status = `${name} - ${data.status}`;
    }
    return (
      <div
        key={index}
        className="flex items-center gap-1"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        <span className="text-gray-800">{status}</span>
      </div>
    );
  };
  if (myPresenceState.error) {
    return (
      <div className="flex-1 flex-col flex flex-nowrap items-start gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 text-red-600">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span>Error: {myPresenceState.error.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex-col flex flex-nowrap items-start gap-4 overflow-x-auto">
      {myPresenceState.present && presenceData.map((member, idx) => renderPresentMember(member, idx))}
    </div>
  );
};
