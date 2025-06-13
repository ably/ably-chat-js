// imported for docs linking
import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { ChatClient } from '../../core/chat.js';
import { Logger } from '../../core/logger.js';
import { Room } from '../../core/room.js';
import { RoomOptions } from '../../core/room-options.js';
import { ChatRoomContext, ChatRoomContextType } from '../contexts/chat-room-context.js';
import { useChatClient } from '../hooks/use-chat-client.js';
import { useLogger } from '../hooks/use-logger.js';

/**
 * Props for the {@link ChatRoomProvider} component.
 */
export interface ChatRoomProviderProps {
  /** The name of the room. */
  name: string;

  /**
   * Overriding options to use when creating the room.
   *
   * NOTE: This value is not memoized by the provider. It must be memoized in your component to prevent
   * re-renders of a parent component from causing the room to be recreated.
   */
  options?: RoomOptions;

  /**
   * Set to `false` to disable auto-releasing the room when component unmounts,
   * to support multiple {@link ChatRoomProvider}s for the same room.
   *
   * If set to `false`, you must manually release the room using
   * `chatClient.rooms.release(id)` or have another {@link ChatRoomProvider} for
   * the same room and {@link release} set to `true`.
   *
   * @defaultValue `true`
   */
  release?: boolean;

  /**
   * Set to `false` to disable auto-attaching the room when component mounts
   * and auto-detaching when it unmounts.
   *
   * If set to `false`, you must manually attach and detach the room using
   * `room.attach()` and `room.detach()` or the provided shortcut functions
   * that {@link useRoom} provides.
   * Setting this flag to `false` is useful in the case where you have more providers for the same room,
   * and you need to control the attachment manually or by choosing which provider handles it.
   *
   * @defaultValue `true`
   */
  attach?: boolean;

  /** Children nodes. */
  children?: ReactNode | ReactNode[] | null;
}

interface RoomReleaseOp {
  id: string;
  options: RoomOptions | undefined;
  abort: AbortController;
}

class RoomReleaseQueue {
  private readonly _queue: RoomReleaseOp[];
  private readonly _logger: Logger;
  constructor(logger: Logger) {
    logger.trace('RoomReleaseQueue();');
    this._queue = [];
    this._logger = logger;
  }

  enqueue(client: ChatClient, id: string, options: RoomOptions | undefined) {
    const abort = new AbortController();
    const op: RoomReleaseOp = { id, options, abort };
    this._queue.push(op);
    this._logger.debug(`RoomReleaseQueue(); enqueued release`, { id, options });

    void Promise.resolve()
      .then(() => {
        if (abort.signal.aborted) {
          this._logger.debug(`RoomReleaseQueue(); aborting release`, { id, options });
          return;
        }

        this._logger.debug(`RoomReleaseQueue(); releasing room`, { id, options });
        void client.rooms.release(id).catch(() => void 0);
      })
      .catch(() => void 0)
      .finally(() => {
        this._logger.debug(`RoomReleaseQueue(); dequeued release`, { id, options });
        this._queue.splice(this._queue.indexOf(op), 1);
      });
  }

  abort(id: string, options: RoomOptions | undefined) {
    this._logger.debug(`RoomReleaseQueue(); checking for abort`, { id, options, length: this._queue.length });
    const op = this._queue.find((op) => op.id === id && op.options === options);
    if (op) {
      this._logger.debug(`RoomReleaseQueue(); triggering abort`, { id, options });
      op.abort.abort();
    }
  }

  get logger(): Logger {
    return this._logger;
  }
}

/**
 * Provider for a {@link Room}. Must be wrapped in a {@link ChatClientProvider}.
 *
 * See {@link ChatRoomProviderProps} for the available props and configuring the
 * provider to automatically attach, detach and/or release the room.
 */
export const ChatRoomProvider: React.FC<ChatRoomProviderProps> = ({
  name: roomName,
  options,
  release = true,
  attach = true,
  children,
}) => {
  const client = useChatClient();
  const clientLogger = useLogger();
  const logger = useMemo(() => clientLogger.withContext({ roomName }), [clientLogger, roomName]);
  logger.debug(`ChatRoomProvider();`, { options, release, attach });

  // Set the initial room promise, we do this in a function to avoid rooms.get being called
  // every time the component re-renders
  // In StrictMode this will be called twice one after the other, but that's ok
  const [value, setValue] = useState<ChatRoomContextType>(() => {
    logger.debug(`ChatRoomProvider(); initializing value`, { options });
    const room = client.rooms.get(roomName, options);
    room.catch(() => void 0);
    return { room: room, roomName: roomName, options: options, client: client };
  });

  // Create a queue to manage release ops
  const roomReleaseQueue = useRef(new RoomReleaseQueue(logger));

  // update the release queue if the logger changes - as it means we have a new client
  // and only if it actually changes, not because strict mode ran it twice
  useEffect(() => {
    // Don't create a new queue if the logger hasn't actually changed
    if (roomReleaseQueue.current.logger === logger) {
      return;
    }

    logger.debug(`ChatRoomProvider(); updating release queue`);
    roomReleaseQueue.current = new RoomReleaseQueue(logger);
  }, [logger]);

  // Create an effect that manages the room state, handles attaching and releasing
  useEffect(() => {
    logger.debug(`ChatRoomProvider(); running lifecycle useEffect`);
    let unmounted = false;
    let resolvedRoom: Room | undefined;
    const currentReleaseQueue = roomReleaseQueue.current;

    // If there was a previous release queued for this room (same id and options), abort it
    currentReleaseQueue.abort(roomName, options);

    // Get the room promise
    const room = client.rooms.get(roomName, options);
    room.catch(() => void 0);

    // If we've had a change in the room id or options, update the value in the state
    setValue((prev: ChatRoomContextType) => {
      // If the room id and options haven't changed, then we don't need to do anything
      if (prev.client === client && prev.roomName === roomName && prev.options === options) {
        logger.debug(`ChatRoomProvider(); no change in room id or options`, { options });
        return prev;
      }

      logger.debug(`ChatRoomProvider(); updating value`, { options });
      return { room: room, roomName, options, client };
    });

    // Use the room promise to attach
    void room
      .then((room: Room) => {
        if (unmounted) {
          logger.debug(`ChatRoomProvider(); unmounted before room resolved`);
          return;
        }

        logger.debug(`ChatRoomProvider(); room resolved`);
        resolvedRoom = room;

        if (attach) {
          // attachment error and/or room status is available via useRoom
          // or room.status, no need to do anything with the promise here
          logger.debug(`ChatRoomProvider(); attaching room`);
          void room.attach().catch(() => {
            // Ignore, the error will be available via various room status properties
          });
        }
      })
      .catch(() => void 0);

    // Cleanup function
    return () => {
      unmounted = true;
      logger.debug(`ChatRoomProvider(); cleaning up lifecycle useEffect`);

      // If we're releasing, release the room. We'll do this in an abortable way so that we don't kill off the value
      // when using StrictMode
      if (release) {
        logger.debug(`ChatRoomProvider(); releasing room`);
        currentReleaseQueue.enqueue(client, roomName, options);
        return;
      } else if (resolvedRoom && attach) {
        // If we're not releasing, but we are attaching, then we should detach the room, but only iff the room
        // was resolved in time
        logger.debug(`ChatRoomProvider(); detaching room`);
        void resolvedRoom.detach().catch(() => {
          // Ignore, the error will be available via various room status properties
        });
      }
    };
  }, [roomName, options, logger, attach, release, client]);

  return <ChatRoomContext.Provider value={value}>{children}</ChatRoomContext.Provider>;
};
