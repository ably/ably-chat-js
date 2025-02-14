// import { FC } from 'react';
// import { useChatClient, useTyping } from '@ably/chat';
//
// interface TypingIndicatorPanelProps {}
//
// export const TypingIndicatorPanel: FC<TypingIndicatorPanelProps> = () => {
//   const chatClient = useChatClient();
//   const clientId = chatClient.clientId;
//   const { currentlyTyping, error } = useTyping();
//
//   return (
//     <div>
//       {error && <div className="text-red-600 dark:text-red-500 p-3">Typing indicator error: {error.message}</div>}
//       {!error && (
//         <div className="typing-indicator-container">
//           {new Array(...currentlyTyping)
//             .filter((client) => client !== clientId)
//             .map((client) => (
//               <p key={client}>{client} is typing...</p>
//             ))}
//         </div>
//       )}
//     </div>
//   );
// };
