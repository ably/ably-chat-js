import { Room } from '@ably/chat';
import { useEffect, useState } from 'react';

import { useLogger } from '../hooks/use-logger.js';
import { useRoomContext } from './use-room-context.js';
import { useStableReference } from './use-stable-reference.js';

/**
 * Given a room promise, this hook will return the room object once it has been resolved. This is useful
 * in hooks like useRoom to provide a direct reference to the room object, as Promises aren't usually the best
 * thing to be passing around React components.
 *
 * @param roomId The roomId of the room
 * @param room The room promise that we're waiting to resolve
 * @returns The room object if it has resolved, otherwise undefined
 */
export const useEventualRoom = (): Room | undefined => {
  const [roomState, setRoomState] = useState<Room | undefined>();
  const context = useRoomContext('useEventualRoom');
  const logger = useLogger();
  logger.trace('useEventualRoom();', { roomId: context.roomId });

  useEffect(() => {
    logger.debug('useEventualRoom(); running useEffect', { roomId: context.roomId });
    let unmounted = false;
    void context.room
      .then((room: Room) => {
        if (unmounted) {
          logger.debug('useEventualRoom(); already unmounted', { roomId: context.roomId });
          return;
        }

        logger.debug('useEventualRoom(); resolved', { roomId: context.roomId });
        setRoomState(room);
      })
      .catch((error: unknown) => {
        logger.error('Failed to get room', { roomId: context.roomId, error });
      });

    return () => {
      logger.debug('useEventualRoom(); cleanup', { roomId: context.roomId });
      unmounted = true;
    };
  }, [context, logger]);

  return roomState;
};

/**
 * Similar to useEventualRoom, but instead of providing the room itself, it provides a property of the room - e.g.
 * Messages. We use this to eventually provide access to underlying room interfaces as non-promise values
 * in hooks like useMessages.
 * @param roomId The roomId of the room
 * @param room The room promise that we're waiting to resolve
 * @param onResolve A function that will be called when the room promise resolves, and will return the property of the room
 * @returns
 */
export const useEventualRoomProperty = <T>(onResolve: (room: Room) => T) => {
  const [roomState, setRoomState] = useState<T | undefined>();
  const context = useRoomContext('useEventualRoomProperty');
  const logger = useLogger();
  logger.trace('useEventualRoomProperty();', { roomId: context.roomId });
  const onResolveRef = useStableReference(onResolve);

  useEffect(() => {
    let unmounted = false;
    logger.debug('useEventualRoomProperty(); running useEffect', { roomId: context.roomId });
    void context.room
      .then((room: Room) => {
        if (unmounted) {
          logger.debug('useEventualRoomProperty(); already unmounted', { roomId: context.roomId });
          return;
        }

        logger.debug('useEventualRoomProperty(); resolved', { roomId: context.roomId });
        setRoomState(onResolveRef(room));
      })
      .catch((error: unknown) => {
        logger.error('Failed to get room', { roomId: context.roomId, error });
      });

    return () => {
      logger.debug('useEventualRoomProperty(); cleanup', { roomId: context.roomId });
      unmounted = true;
    };
  }, [context, logger, onResolveRef]);

  return roomState;
};