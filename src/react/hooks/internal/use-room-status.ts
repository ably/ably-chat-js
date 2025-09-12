import * as Ably from 'ably';
import { useEffect, useState } from 'react';

import { Room } from '../../../core/room.js';
import { RoomStatus, RoomStatusChange } from '../../../core/room-status.js';
import { wrapRoomPromise } from '../../helper/room-promise.js';
import { useEventListenerRef } from './use-event-listener-ref.js';
import { useRoomLogger } from './use-logger.js';
import { useRoomContext } from './use-room-context.js';

/**
 * The response object for the useRoomStatus hook.
 */
export interface UseRoomStatusResponse {
  /**
   * The current status of the room.
   */
  readonly status: RoomStatus;

  /**
   * The error that caused the room to transition to an errored state.
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * The parameters for the useRoomStatus hook.
 */
export interface UseRoomStatusParams {
  /**
   * A listener for room status changes.
   */
  onRoomStatusChange?: (change: RoomStatusChange) => void;
}

/**
 * A hook that returns the current status of the room, and listens for changes to the room status.
 * @internal
 * @param params An optional user-provided listener for room status changes.
 * @returns The current status of the room, and an error if the room is in an errored state.
 */
export const useRoomStatus = (params?: UseRoomStatusParams): UseRoomStatusResponse => {
  const context = useRoomContext('useRoomStatus');

  const [status, setStatus] = useState<RoomStatus>(RoomStatus.Initializing);
  const [error, setError] = useState<Ably.ErrorInfo | undefined>();
  const logger = useRoomLogger();

  // create stable references for the listeners and register the user-provided callbacks
  const onRoomStatusChangeRef = useEventListenerRef(params?.onRoomStatusChange);

  // create an internal listener to update the status
  useEffect(() => {
    const roomPromise = wrapRoomPromise(
      context.room,
      (room: Room) => {
        logger.debug('useRoomStatus(); subscribing internal listener');
        // Set instantaneous values
        setStatus(room.status);
        setError(room.error);

        // Add the subscription
        const { off } = room.onStatusChange((change) => {
          logger.debug('useRoomStatus(); status change', change);
          setStatus(change.current);
          setError(change.error);
        });

        return () => {
          logger.debug('useRoomStatus(); unsubscribing internal listener');
          off();
        };
      },
      logger,
    );

    return roomPromise.unmount();
  }, [context, logger]);

  useEffect(() => {
    const roomPromise = wrapRoomPromise(
      context.room,
      (room: Room) => {
        let off: (() => void) | undefined;
        if (onRoomStatusChangeRef) {
          logger.debug('useRoomStatus(); subscribing to status changes');
          off = room.onStatusChange(onRoomStatusChangeRef).off;
        }

        logger.debug('useRoomStatus(); setting initial status', { status: room.status });
        if (onRoomStatusChangeRef) {
          logger.debug('useRoomStatus(); sending initial status event');
          onRoomStatusChangeRef({
            current: room.status,
            previous: RoomStatus.Initializing,
            error: room.error,
          });
        }

        return () => {
          logger.debug('useRoomStatus(); unmounting');
          if (off) {
            logger.debug('useRoomStatus(); unsubscribing from status changes');
            off();
          }
        };
      },
      logger,
    );

    return roomPromise.unmount();
  }, [context, logger, onRoomStatusChangeRef]);

  return {
    status,
    error,
  };
};
