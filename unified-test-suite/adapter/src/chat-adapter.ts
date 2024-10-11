import {
  ChatClient,
  Connection,
  ConnectionStatus,
  Logger,
  Message,
  Messages,
  MessageSubscriptionResponse,
  Occupancy,
  OccupancySubscriptionResponse,
  OnConnectionStatusChangeResponse,
  OnDiscontinuitySubscriptionResponse,
  OnRoomStatusChangeResponse,
  PaginatedResult,
  Presence,
  PresenceSubscriptionResponse,
  Room,
  RoomReactions,
  RoomReactionsSubscriptionResponse,
  Rooms,
  RoomStatus,
  Typing,
  TypingSubscriptionResponse,
} from '@ably/chat';
import { Realtime, RealtimeChannel } from 'ably';
import { JSONRPCServer } from 'json-rpc-2.0';
import { nanoid } from 'nanoid';

import { clientRpc } from './json-rpc';

const idToChatClient: Map<string, ChatClient> = new Map();
const idToConnectionStatus: Map<string, ConnectionStatus> = new Map();
const idToOnConnectionStatusChangeResponse: Map<string, OnConnectionStatusChangeResponse> = new Map();
const idToConnection: Map<string, Connection> = new Map();
const idToLogger: Map<string, Logger> = new Map();
const idToMessage: Map<string, Message> = new Map();
const idToMessages: Map<string, Messages> = new Map();
const idToMessageSubscriptionResponse: Map<string, MessageSubscriptionResponse> = new Map();
const idToOccupancy: Map<string, Occupancy> = new Map();
const idToOccupancySubscriptionResponse: Map<string, OccupancySubscriptionResponse> = new Map();
const idToOnDiscontinuitySubscriptionResponse: Map<string, OnDiscontinuitySubscriptionResponse> = new Map();
const idToPaginatedResult: Map<string, PaginatedResult<any>> = new Map();
const idToPresence: Map<string, Presence> = new Map();
const idToPresenceSubscriptionResponse: Map<string, PresenceSubscriptionResponse> = new Map();
const idToRoomReactions: Map<string, RoomReactions> = new Map();
const idToRoomReactionsSubscriptionResponse: Map<string, RoomReactionsSubscriptionResponse> = new Map();
const idToRoomStatus: Map<string, RoomStatus> = new Map();
const idToOnRoomStatusChangeResponse: Map<string, OnRoomStatusChangeResponse> = new Map();
const idToRoom: Map<string, Room> = new Map();
const idToRooms: Map<string, Rooms> = new Map();
const idToTyping: Map<string, Typing> = new Map();
const idToTypingSubscriptionResponse: Map<string, TypingSubscriptionResponse> = new Map();
const idToRealtime: Map<string, Realtime> = new Map();
const idToRealtimeChannel: Map<string, RealtimeChannel> = new Map();
const idToPaginatedResultMessage: Map<string, PaginatedResult<Message>> = new Map();

export const buildChatAdapter = (jsonRpc: JSONRPCServer) => {
    jsonRpc.addMethod('ChatClient', ({ args: { realtimeClientOptions, clientOptions } }) => {
        const refId = nanoid();
        const realtime = new Realtime(realtimeClientOptions);
        const instance = new ChatClient(realtime, clientOptions);
        idToChatClient.set(refId, instance);
        return { refId };
    });

    jsonRpc.addMethod('ChatClient#rooms', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        const field = instance.rooms;
        const fieldRefId = nanoid();
        idToRooms.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('ChatClient#connection', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        const field = instance.connection;
        const fieldRefId = nanoid();
        idToConnection.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('ChatClient#clientId', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        const field = instance.clientId;
        return { response: field };
    });

    jsonRpc.addMethod('ChatClient#realtime', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        const field = instance.realtime;
        const fieldRefId = nanoid();
        idToRealtime.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('ChatClient#clientOptions', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        const field = instance.clientOptions;
        return { response: field };
    });

    jsonRpc.addMethod('ChatClient#logger', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        const field = instance.logger;
        const fieldRefId = nanoid();
        idToLogger.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('ChatClient.addReactAgent', ({ refId }) => {
        const instance = idToChatClient.get(refId)!;
        instance.addReactAgent();
        return {};
    });

    jsonRpc.addMethod('ConnectionStatus#current', ({ refId }) => {
        const instance = idToConnectionStatus.get(refId)!;
        const field = instance.current;
        return { response: field };
    });

    jsonRpc.addMethod('ConnectionStatus#error', ({ refId }) => {
        const instance = idToConnectionStatus.get(refId)!;
        const field = instance.error;
        return { response: field };
    });

    jsonRpc.addMethod('ConnectionStatus.offAll', ({ refId }) => {
        const instance = idToConnectionStatus.get(refId)!;
        instance.offAll();
        return {};
    });

    jsonRpc.addMethod('ConnectionStatus.onChange', async ({ refId, callbackId }) => {
        const instance = idToConnectionStatus.get(refId)!;
        const callback = (change: any) => {
            clientRpc.request('callback', { callbackId, args: { change } });
        };
        const result = instance.onChange(callback);
        const resultRefId = nanoid();
        idToOnConnectionStatusChangeResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('OnConnectionStatusChangeResponse.off', ({ refId }) => {
        const instance = idToOnConnectionStatusChangeResponse.get(refId)!;
        instance.off();
        return {};
    });

    jsonRpc.addMethod('Connection#status', ({ refId }) => {
        const instance = idToConnection.get(refId)!;
        const field = instance.status;
        const fieldRefId = nanoid();
        idToConnectionStatus.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Logger.trace', ({ refId, args: { message, context } }) => {
        const instance = idToLogger.get(refId)!;
        instance.trace(message, context);
        return {};
    });

    jsonRpc.addMethod('Logger.debug', ({ refId, args: { message, context } }) => {
        const instance = idToLogger.get(refId)!;
        instance.debug(message, context);
        return {};
    });

    jsonRpc.addMethod('Logger.info', ({ refId, args: { message, context } }) => {
        const instance = idToLogger.get(refId)!;
        instance.info(message, context);
        return {};
    });

    jsonRpc.addMethod('Logger.warn', ({ refId, args: { message, context } }) => {
        const instance = idToLogger.get(refId)!;
        instance.warn(message, context);
        return {};
    });

    jsonRpc.addMethod('Logger.error', ({ refId, args: { message, context } }) => {
        const instance = idToLogger.get(refId)!;
        instance.error(message, context);
        return {};
    });

    jsonRpc.addMethod('Message#timeserial', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.timeserial;
        return { response: field };
    });

    jsonRpc.addMethod('Message#clientId', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.clientId;
        return { response: field };
    });

    jsonRpc.addMethod('Message#roomId', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.roomId;
        return { response: field };
    });

    jsonRpc.addMethod('Message#text', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.text;
        return { response: field };
    });

    jsonRpc.addMethod('Message#createdAt', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.createdAt;
        return { response: field };
    });

    jsonRpc.addMethod('Message#metadata', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.metadata;
        return { response: field };
    });

    jsonRpc.addMethod('Message#headers', ({ refId }) => {
        const instance = idToMessage.get(refId)!;
        const field = instance.headers;
        return { response: field };
    });

    jsonRpc.addMethod('Message.before', ({ refId, args: { message } }) => {
        const instance = idToMessage.get(refId)!;
        const result = instance.before(message);
        return { response: result };
    });

    jsonRpc.addMethod('Message.after', ({ refId, args: { message } }) => {
        const instance = idToMessage.get(refId)!;
        const result = instance.after(message);
        return { response: result };
    });

    jsonRpc.addMethod('Message.equal', ({ refId, args: { message } }) => {
        const instance = idToMessage.get(refId)!;
        const result = instance.equal(message);
        return { response: result };
    });

    jsonRpc.addMethod('Messages#channel', async ({ refId }) => {
        const instance = idToMessages.get(refId)!;
        const field = await instance.channel;
        const fieldRefId = nanoid();
        idToRealtimeChannel.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Messages.get', async ({ refId, args: { options } }) => {
        const instance = idToMessages.get(refId)!;
        const result = await instance.get(options);
        const resultRefId = nanoid();
        idToPaginatedResultMessage.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Messages.send', async ({ refId, args: { params } }) => {
        const instance = idToMessages.get(refId)!;
        const result = await instance.send(params);
        const resultRefId = nanoid();
        idToMessage.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Messages.unsubscribeAll', ({ refId }) => {
        const instance = idToMessages.get(refId)!;
        instance.unsubscribeAll();
        return {};
    });

    jsonRpc.addMethod('Messages.subscribe', async ({ refId, callbackId }) => {
        const instance = idToMessages.get(refId)!;
        const callback = (event: any) => {
            clientRpc.request('callback', { callbackId, args: { event } });
        };
        const result = instance.subscribe(callback);
        const resultRefId = nanoid();
        idToMessageSubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Messages.onDiscontinuity', async ({ refId, callbackId }) => {
        const instance = idToMessages.get(refId)!;
        const callback = (reason: any) => {
            clientRpc.request('callback', { callbackId, args: { reason } });
        };
        const result = instance.onDiscontinuity(callback);
        const resultRefId = nanoid();
        idToOnDiscontinuitySubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('MessageSubscriptionResponse.getPreviousMessages', async ({ refId, args: { params } }) => {
        const instance = idToMessageSubscriptionResponse.get(refId)!;
        const result = await instance.getPreviousMessages(params);
        const resultRefId = nanoid();
        idToPaginatedResultMessage.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('MessageSubscriptionResponse.unsubscribe', ({ refId }) => {
        const instance = idToMessageSubscriptionResponse.get(refId)!;
        instance.unsubscribe();
        return {};
    });

    jsonRpc.addMethod('Occupancy#channel', async ({ refId }) => {
        const instance = idToOccupancy.get(refId)!;
        const field =await instance.channel;
        const fieldRefId = nanoid();
        idToRealtimeChannel.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Occupancy.get', async ({ refId }) => {
        const instance = idToOccupancy.get(refId)!;
        const result = await instance.get();
        return { response: result };
    });

    jsonRpc.addMethod('Occupancy.unsubscribeAll', ({ refId }) => {
        const instance = idToOccupancy.get(refId)!;
        instance.unsubscribeAll();
        return {};
    });

    jsonRpc.addMethod('Occupancy.subscribe', async ({ refId, callbackId }) => {
        const instance = idToOccupancy.get(refId)!;
        const callback = (event: any) => {
            clientRpc.request('callback', { callbackId, args: { event } });
        };
        const result = instance.subscribe(callback);
        const resultRefId = nanoid();
        idToOccupancySubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Occupancy.onDiscontinuity', async ({ refId, callbackId }) => {
        const instance = idToOccupancy.get(refId)!;
        const callback = (reason: any) => {
            clientRpc.request('callback', { callbackId, args: { reason } });
        };
        const result = instance.onDiscontinuity(callback);
        const resultRefId = nanoid();
        idToOnDiscontinuitySubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('OccupancySubscriptionResponse.unsubscribe', ({ refId }) => {
        const instance = idToOccupancySubscriptionResponse.get(refId)!;
        instance.unsubscribe();
        return {};
    });

    jsonRpc.addMethod('OnDiscontinuitySubscriptionResponse.off', ({ refId }) => {
        const instance = idToOnDiscontinuitySubscriptionResponse.get(refId)!;
        instance.off();
        return {};
    });

    jsonRpc.addMethod('PaginatedResult#items', ({ refId }) => {
        const instance = idToPaginatedResult.get(refId)!;
        const field = instance.items;
        return { response: field };
    });

    jsonRpc.addMethod('PaginatedResult.next', async ({ refId }) => {
        const instance = idToPaginatedResult.get(refId)!;
        // TODO: need to handle union type result: PaginatedResult<any> | null
        const result = await instance.next();
        const resultRefId = nanoid();
        idToPaginatedResult.set(resultRefId, result!);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('PaginatedResult.first', async ({ refId }) => {
        const instance = idToPaginatedResult.get(refId)!;
        const result = await instance.first();
        const resultRefId = nanoid();
        idToPaginatedResult.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('PaginatedResult.current', async ({ refId }) => {
        const instance = idToPaginatedResult.get(refId)!;
        const result = await instance.current();
        const resultRefId = nanoid();
        idToPaginatedResult.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('PaginatedResult.hasNext', ({ refId }) => {
        const instance = idToPaginatedResult.get(refId)!;
        const result = instance.hasNext();
        return { response: result };
    });

    jsonRpc.addMethod('PaginatedResult.isLast', ({ refId }) => {
        const instance = idToPaginatedResult.get(refId)!;
        const result = instance.isLast();
        return { response: result };
    });

    jsonRpc.addMethod('Presence#channel', async ({ refId }) => {
        const instance = idToPresence.get(refId)!;
        const field = await instance.channel;
        const fieldRefId = nanoid();
        idToRealtimeChannel.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Presence.get', async ({ refId, args: { params } }) => {
        const instance = idToPresence.get(refId)!;
        const result = await instance.get(params);
        return { response: result };
    });

    jsonRpc.addMethod('Presence.isUserPresent', async ({ refId, args: { clientId } }) => {
        const instance = idToPresence.get(refId)!;
        const result = await instance.isUserPresent(clientId);
        return { response: result };
    });

    jsonRpc.addMethod('Presence.enter', async ({ refId, args: { data } }) => {
        const instance = idToPresence.get(refId)!;
        await instance.enter(data);
        return {};
    });

    jsonRpc.addMethod('Presence.update', async ({ refId, args: { data } }) => {
        const instance = idToPresence.get(refId)!;
        await instance.update(data);
        return {};
    });

    jsonRpc.addMethod('Presence.leave', async ({ refId, args: { data } }) => {
        const instance = idToPresence.get(refId)!;
        await instance.leave(data);
        return {};
    });

    jsonRpc.addMethod('Presence.unsubscribeAll', ({ refId }) => {
        const instance = idToPresence.get(refId)!;
        instance.unsubscribeAll();
        return {};
    });

    jsonRpc.addMethod('Presence.subscribe_listener', async ({ refId, callbackId }) => {
        const instance = idToPresence.get(refId)!;
        const callback = (event: any) => {
            clientRpc.request('callback', { callbackId, args: { event } });
        };
        const result = instance.subscribe(callback);
        const resultRefId = nanoid();
        idToPresenceSubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Presence.subscribe_eventsAndListener', async ({ refId, callbackId, args: { events } }) => {
        const instance = idToPresence.get(refId)!;
        const callback = (event: any) => {
            clientRpc.request('callback', { callbackId, args: { event } });
        };
        const result = instance.subscribe(events, callback);
        const resultRefId = nanoid();
        idToPresenceSubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Presence.onDiscontinuity', async ({ refId, callbackId }) => {
        const instance = idToPresence.get(refId)!;
        const callback = (reason: any) => {
            clientRpc.request('callback', { callbackId, args: { reason } });
        };
        const result = instance.onDiscontinuity(callback);
        const resultRefId = nanoid();
        idToOnDiscontinuitySubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('PresenceSubscriptionResponse.unsubscribe', ({ refId }) => {
        const instance = idToPresenceSubscriptionResponse.get(refId)!;
        instance.unsubscribe();
        return {};
    });

    jsonRpc.addMethod('RoomReactions#channel', async ({ refId }) => {
        const instance = idToRoomReactions.get(refId)!;
        const field = await instance.channel;
        const fieldRefId = nanoid();
        idToRealtimeChannel.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('RoomReactions.send', async ({ refId, args: { params } }) => {
        const instance = idToRoomReactions.get(refId)!;
        await instance.send(params);
        return {};
    });

    jsonRpc.addMethod('RoomReactions.unsubscribeAll', ({ refId }) => {
        const instance = idToRoomReactions.get(refId)!;
        instance.unsubscribeAll();
        return {};
    });

    jsonRpc.addMethod('RoomReactions.subscribe', async ({ refId, callbackId }) => {
        const instance = idToRoomReactions.get(refId)!;
        const callback = (reaction: any) => {
            clientRpc.request('callback', { callbackId, args: { reaction } });
        };
        const result = instance.subscribe(callback);
        const resultRefId = nanoid();
        idToRoomReactionsSubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('RoomReactions.onDiscontinuity', async ({ refId, callbackId }) => {
        const instance = idToRoomReactions.get(refId)!;
        const callback = (reason: any) => {
            clientRpc.request('callback', { callbackId, args: { reason } });
        };
        const result = instance.onDiscontinuity(callback);
        const resultRefId = nanoid();
        idToOnDiscontinuitySubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('RoomReactionsSubscriptionResponse.unsubscribe', ({ refId }) => {
        const instance = idToRoomReactionsSubscriptionResponse.get(refId)!;
        instance.unsubscribe();
        return {};
    });

    jsonRpc.addMethod('RoomStatus#current', ({ refId }) => {
        const instance = idToRoomStatus.get(refId)!;
        const field = instance.current;
        return { response: field };
    });

    jsonRpc.addMethod('RoomStatus#error', ({ refId }) => {
        const instance = idToRoomStatus.get(refId)!;
        const field = instance.error;
        return { response: field };
    });

    jsonRpc.addMethod('RoomStatus.offAll', ({ refId }) => {
        const instance = idToRoomStatus.get(refId)!;
        instance.offAll();
        return {};
    });

    jsonRpc.addMethod('RoomStatus.onChange', async ({ refId, callbackId }) => {
        const instance = idToRoomStatus.get(refId)!;
        const callback = (change: any) => {
            clientRpc.request('callback', { callbackId, args: { change } });
        };
        const result = instance.onChange(callback);
        const resultRefId = nanoid();
        idToOnRoomStatusChangeResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('OnRoomStatusChangeResponse.off', ({ refId }) => {
        const instance = idToOnRoomStatusChangeResponse.get(refId)!;
        instance.off();
        return {};
    });

    jsonRpc.addMethod('Room#roomId', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.roomId;
        return { response: field };
    });

    jsonRpc.addMethod('Room#messages', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.messages;
        const fieldRefId = nanoid();
        idToMessages.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Room#presence', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.presence;
        const fieldRefId = nanoid();
        idToPresence.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Room#reactions', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.reactions;
        const fieldRefId = nanoid();
        idToRoomReactions.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Room#typing', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.typing;
        const fieldRefId = nanoid();
        idToTyping.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Room#occupancy', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.occupancy;
        const fieldRefId = nanoid();
        idToOccupancy.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Room#status', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const field = instance.status;
        const fieldRefId = nanoid();
        idToRoomStatus.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Room.attach', async ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        await instance.attach();
        return {};
    });

    jsonRpc.addMethod('Room.detach', async ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        await instance.detach();
        return {};
    });

    jsonRpc.addMethod('Room.options', ({ refId }) => {
        const instance = idToRoom.get(refId)!;
        const result = instance.options();
        return { response: result };
    });

    jsonRpc.addMethod('Rooms#clientOptions', ({ refId }) => {
        const instance = idToRooms.get(refId)!;
        const field = instance.clientOptions;
        return { response: field };
    });

    jsonRpc.addMethod('Rooms.release', async ({ refId, args: { roomId } }) => {
        const instance = idToRooms.get(refId)!;
        await instance.release(roomId);
        return {};
    });

    jsonRpc.addMethod('Rooms.get', ({ refId, args: { roomId, options } }) => {
        const instance = idToRooms.get(refId)!;
        const result = instance.get(roomId, options);
        const resultRefId = nanoid();
        idToRoom.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Typing#channel', async ({ refId }) => {
        const instance = idToTyping.get(refId)!;
        const field = await instance.channel;
        const fieldRefId = nanoid();
        idToRealtimeChannel.set(fieldRefId, field);
        return { refId: fieldRefId };
    });

    jsonRpc.addMethod('Typing.get', async ({ refId }) => {
        const instance = idToTyping.get(refId)!;
        const result = await instance.get();
        return { response: result };
    });

    jsonRpc.addMethod('Typing.start', async ({ refId }) => {
        const instance = idToTyping.get(refId)!;
        await instance.start();
        return {};
    });

    jsonRpc.addMethod('Typing.stop', async ({ refId }) => {
        const instance = idToTyping.get(refId)!;
        await instance.stop();
        return {};
    });

    jsonRpc.addMethod('Typing.unsubscribeAll', ({ refId }) => {
        const instance = idToTyping.get(refId)!;
        instance.unsubscribeAll();
        return {};
    });

    jsonRpc.addMethod('Typing.subscribe', async ({ refId, callbackId }) => {
        const instance = idToTyping.get(refId)!;
        const callback = (event: any) => {
            clientRpc.request('callback', { callbackId, args: { event } });
        };
        const result = instance.subscribe(callback);
        const resultRefId = nanoid();
        idToTypingSubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('Typing.onDiscontinuity', async ({ refId, callbackId }) => {
        const instance = idToTyping.get(refId)!;
        const callback = (reason: any) => {
            clientRpc.request('callback', { callbackId, args: { reason } });
        };
        const result = instance.onDiscontinuity(callback);
        const resultRefId = nanoid();
        idToOnDiscontinuitySubscriptionResponse.set(resultRefId, result);
        return { refId: resultRefId };
    });

    jsonRpc.addMethod('TypingSubscriptionResponse.unsubscribe', ({ refId }) => {
        const instance = idToTypingSubscriptionResponse.get(refId)!;
        instance.unsubscribe();
        return {};
    });
}
