import { FC } from 'react';
import { PresenceMember } from '@ably/chat';
import { useChatClient, usePresence, usePresenceListener } from '@ably/chat/react';

interface UserListComponentProps {}

export const UserPresenceComponent: FC<UserListComponentProps> = () => {
  const { presenceState } = usePresence({ enterWithData: { status: '💻 Online' } });
  const { presenceData } = usePresenceListener({
    listener: (event: unknown) => {
      console.log('Presence data changed', { event });
    },
  });

  const clientId = useChatClient().clientId;

  const renderPresentMember = (presentMember: PresenceMember, index: number) => {
    let status: string;
    const data = presentMember.data as { status: string };
    if (presentMember.clientId === clientId) {
      status = `👤 You - ${data.status}`;
    } else {
      status = `${presentMember.clientId} - ${data.status}`;
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
  if (presenceState.error) {
    return (
      <div className="flex-1 flex-col flex flex-nowrap items-start gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 text-red-600">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span>Error: {presenceState.error.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex-col flex flex-nowrap items-start gap-4 overflow-x-auto">
      {presenceState.isPresent && presenceData.map((member, idx) => renderPresentMember(member, idx))}
    </div>
  );
};
