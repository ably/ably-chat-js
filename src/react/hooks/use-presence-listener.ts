import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorCodes, errorInfoIs } from '../../core/errors.js';
import { OnlineMember,OnlineStatusListener, Presence } from '../../core/presence.js';
import { RoomStatus } from '../../core/room-status.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useEventualRoomProperty } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';

/**
 * The options for the {@link usePresenceListener} hook.
 */
export interface UsePresenceListenerParams extends StatusParams, Listenable<OnlineStatusListener> {
  /**
   * The listener to be called when the presence state changes.
   * The listener is removed when the component unmounts.
   */
  listener?: OnlineStatusListener;
}

export interface UsePresenceListenerResponse extends ChatStatusResponse {
  /**
   * The current state of all the presence members, observed as a whole change, and only emitted while presence is not syncing.
   */
  readonly presenceData: OnlineMember[];

  /**
   * Provides access to the underlying {@link Presence} instance of the room.
   */
  readonly presence?: Presence;

  /**
   * The error state of the presence listener.
   * The hook keeps {@link presenceData} up to date asynchronously, so this error state is provided to allow
   * the user to handle errors that may occur when fetching presence data.
   * It will be set if there is an error fetching the initial presence data,
   * or if there is an error when fetching presence data after a presence event.
   * The error will be cleared once a new presence event is received and successfully processed.
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * A hook that provides access to the {@link Presence} instance in the room and the current presence state.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will subscribe to the presence state of the room and update the state accordingly.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UsePresenceResponse - An object containing the {@link Presence} instance and the current presence state.
 */
export const usePresenceListener = (params?: UsePresenceListenerParams): UsePresenceListenerResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('usePresenceListener');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);

  const logger = useLogger();
  logger.trace('usePresenceListener();', { roomId: context.roomId });

  const [presenceData, setPresenceData] = useState<OnlineMember[]>([]);
  const errorRef = useRef<Ably.ErrorInfo | undefined>(undefined);

  const [error, setError] = useState<Ably.ErrorInfo | undefined>();

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const setErrorState = useCallback(
    (error: Ably.ErrorInfo) => {
      logger.debug('usePresenceListener(); setting error state', { error, roomId: context.roomId });
      errorRef.current = error;
      setError(error);
    },
    [logger, context],
  );

  const clearErrorState = useCallback(() => {
    logger.debug('usePresenceListener(); clearing error state', { roomId: context.roomId });
    errorRef.current = undefined;
    setError(undefined);
  }, [logger, context]);

  useEffect(() => {
    // Start with a clean slate - no errors and empty set
    clearErrorState();
    setPresenceData((prev) => {
      // keep reference constant if it's already empty
      if (prev.length === 0) return prev;
      return new Array<OnlineMember>();
    });

    let mounted = true;

    void context.room
      .then((room) => {
        // If we're not attached, we can't call typing.get() right now
        if (room.status === RoomStatus.Attached) {
          return room.presence
            .getOnlineStatuses()
            .then((currentlyOnline) => {
              if (!mounted) return;
              setPresenceData(currentlyOnline);
            })
            .catch((error: unknown) => {
              const errorInfo = error as Ably.ErrorInfo;
              if (!mounted || errorInfoIs(errorInfo, ErrorCodes.RoomIsReleased)) return;

              setErrorState(errorInfo);
            });
        } else {
          logger.debug('usePresenceListener(); room not attached, setting OnlineMembers to empty', { roomId: context.roomId });
          setPresenceData(new Array<OnlineMember>());
        }
      })
      .catch();

    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('usePresenceListener(); subscribing to OnlineMember events', { roomId: context.roomId });
        const { unsubscribe } = room.presence.subscribeOnlineStatusEvents((event) => {
          clearErrorState();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          setPresenceData(event.onlineStatuses!);
        });

        return () => {
          logger.debug('usePresenceListener(); unsubscribing from OnlineMember events', { roomId: context.roomId });
          mounted = false;
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, logger]);


  // subscribe the user provided listener to presence changes
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('usePresenceListener(); applying external listener', { roomId: context.roomId });
        const { unsubscribe } = room.presence.subscribeOnlineStatusEvents(listenerRef);

        return () => {
          logger.debug('usePresenceListener(); cleaning up external listener', { roomId: context.roomId });
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, listenerRef, logger]);

  // subscribe the user provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('usePresenceListener(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.presence.onDiscontinuity(onDiscontinuityRef);

        return () => {
          logger.debug('usePresenceListener(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  return {
    presence: useEventualRoomProperty((room) => room.presence),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    presenceData: presenceData,
  };
};
