// import * as Ably from 'ably';
//
// import { messagesChannelName } from './channel.js';
// import { ChannelManager, ChannelOptionsMerger } from './channel-manager.js';
// import {
//   DiscontinuityEmitter,
//   DiscontinuityListener,
//   EmitsDiscontinuities,
//   HandlesDiscontinuity,
//   newDiscontinuityEmitter,
//   OnDiscontinuitySubscriptionResponse,
// } from './discontinuity.js';
// import { ErrorCodes } from './errors.js';
// import { Logger } from './logger.js';
// import { DefaultPresence, OnlineStatus } from './presence.js';
// import { ChatPresenceMessage, PresenceManager } from './presence-data-manager.js';
// import { addListenerToChannelPresenceWithoutAttach } from './realtime-extensions.js';
// import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
// import { RoomOptions, TypingOptionsDefaults, PresenceOptions } from './room-options.js';
// import { DefaultTyping, Typing } from './typing.js';
//
// export interface HandlesUserStatusChange {
//   onUserStatusChange: (event: { previous: ChatPresenceMessage[]; latest: ChatPresenceMessage[] }) => void;
// }
//
// /**
//  * Represents the user status feature.
//  */
// export interface UserStatus extends EmitsDiscontinuities {
//   /**
//    * The typing feature for the chat room.
//    */
//   typing: Typing;
//
//   /**
//    * The online status feature for the chat room.
//    */
//   onlineStatus: OnlineStatus;
//
//   /**
//    * Gets the channel on which the feature operates.
//    */
//   get channel(): Ably.RealtimeChannel;
// }
//
// export class DefaultUserStatus implements UserStatus, HandlesDiscontinuity, ContributesToRoomLifecycle {
//   private readonly _roomId: string;
//   private readonly _channel: Ably.RealtimeChannel;
//   private readonly _clientId: string;
//   private readonly _logger: Logger;
//   private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
//   private readonly _presenceManager: PresenceManager;
//   readonly typing: DefaultTyping;
//   readonly onlineStatus: DefaultOnlineStatus;
//   readonly _internalListeners: HandlesUserStatusChange[] = [];
//
//   constructor(
//     roomId: string,
//     clientId: string,
//     logger: Logger,
//     channelManager: ChannelManager,
//     presenceManage: PresenceManager,
//     options: UserStatusOptions,
//   ) {
//     this._roomId = roomId;
//     this._clientId = clientId;
//     this._logger = logger;
//     this._logger.trace('UserStatus.constructor();');
//     this._presenceManager = presenceManage;
//     this._channel = this._makeChannel(roomId, channelManager);
//
//     this.typing = new DefaultTyping(
//       this._roomId,
//       options.typingOptions ?? TypingOptionsDefaults,
//       this._presenceManager,
//       clientId,
//       logger,
//     );
//     this._internalListeners.push(this.typing);
//
//     this.onlineStatus = new DefaultOnlineStatus(this._roomId, this._presenceManager, clientId, logger);
//     this._internalListeners.push(this.onlineStatus);
//   }
//
//   /**
//    * Retrieve the underlying Ably realtime channel used for tracking online status in this chat room.
//    * @returns The realtime channel.
//    */
//   get channel(): Ably.RealtimeChannel {
//     return this._channel;
//   }
//
//   /**
//    * Creates the realtime channel for tracking user status.
//    */
//   private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
//     const channel = channelManager.get(DefaultUserStatus.channelName(roomId));
//
//     addListenerToChannelPresenceWithoutAttach({
//       listener: this._internalSubscribeToEvents.bind(this),
//       channel: channel,
//     });
//     return channel;
//   }
//
//   /**
//    * Subscribes to the presence events on the channel. When a presence event is received, it gets the previous and
//    * latest presence set and propagates the change to the listeners.
//    */
//   private _internalSubscribeToEvents(event: Ably.PresenceMessage): void {
//     this._logger.trace('UserStatus._internalSubscribeToEvents();', { event });
//     this._presenceManager
//       .getPresenceSet()
//       .then((change) => {
//         for (const listener of this._internalListeners) {
//           listener.onUserStatusChange({ ...change });
//         }
//       })
//       .catch(() => {
//         // We don't throw an error here if we fail to get an event.
//         return;
//       });
//   }
//
//   /**
//    * Merges the channel options for the room with the ones required for user-status changes.
//    *
//    * @param roomOptions The room options to merge for.
//    * @returns A function that merges the channel options for the room with the ones required for user-status.
//    */
//   static channelOptionMerger(roomOptions: RoomOptions): ChannelOptionsMerger {
//     return (options) => {
//       const channelModes = ['PUBLISH', 'SUBSCRIBE'] as Ably.ChannelMode[];
//       if (roomOptions.userStatus?.update === undefined || roomOptions.userStatus.update) {
//         channelModes.push('PRESENCE');
//       }
//
//       if (roomOptions.userStatus?.subscribe === undefined || roomOptions.userStatus.subscribe) {
//         channelModes.push('PRESENCE_SUBSCRIBE');
//       }
//
//       return { ...options, modes: channelModes };
//     };
//   }
//
//   // TODO - Should sub features also have a handler for this?
//   onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
//     this._logger.trace('UserStatus.onDiscontinuity();');
//     this._discontinuityEmitter.on(listener);
//
//     return {
//       off: () => {
//         this._discontinuityEmitter.off(listener);
//       },
//     };
//   }
//
//   /**
//    * @inheritdoc HandlesDiscontinuity
//    */
//   discontinuityDetected(reason?: Ably.ErrorInfo): void {
//     this._logger.warn('UserStatus.discontinuityDetected();', { reason });
//     this._discontinuityEmitter.emit('discontinuity', reason);
//   }
//
//   /**
//    * @inheritdoc ContributesToRoomLifecycle
//    */
//   get attachmentErrorCode(): ErrorCodes {
//     return ErrorCodes.MessagesAttachmentFailed;
//   }
//
//   /**
//    * @inheritdoc ContributesToRoomLifecycle
//    */
//   get detachmentErrorCode(): ErrorCodes {
//     return ErrorCodes.MessagesDetachmentFailed;
//   }
//
//   /**
//    * Returns the channel name for the presence channel.
//    *
//    * @param roomId The unique identifier of the room.
//    * @returns The channel name for the presence channel.
//    */
//   static channelName(roomId: string): string {
//     return messagesChannelName(roomId);
//   }
// }
