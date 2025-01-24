var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as Ably from 'ably';
import { DefaultMessage } from './message.js';
import { OrderBy } from './messages.js';
/**
 * Chat SDK Backend
 */
export class ChatApi {
    constructor(realtime, logger) {
        this._apiProtocolVersion = 3;
        this._realtime = realtime;
        this._logger = logger;
    }
    getMessages(roomId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            roomId = encodeURIComponent(roomId);
            // convert the params into internal format
            const apiParams = Object.assign({}, params);
            if (params.orderBy) {
                switch (params.orderBy) {
                    case OrderBy.NewestFirst: {
                        apiParams.direction = 'backwards';
                        break;
                    }
                    case OrderBy.OldestFirst: {
                        apiParams.direction = 'forwards';
                        break;
                    }
                    default: {
                        // in vanilla JS use-cases, without types, we need to check non-enum values
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        throw new Ably.ErrorInfo(`invalid orderBy value: ${params.orderBy}`, 40000, 400);
                    }
                }
            }
            const data = yield this._makeAuthorizedPaginatedRequest(`/chat/v2/rooms/${roomId}/messages`, apiParams);
            return this._recursivePaginateMessages(data);
        });
    }
    _recursivePaginateMessages(data) {
        const mapToDefaultMessage = (message) => {
            const metadata = message.metadata;
            const headers = message.headers;
            return new DefaultMessage(message.serial, message.clientId, message.roomId, message.text, metadata !== null && metadata !== void 0 ? metadata : {}, headers !== null && headers !== void 0 ? headers : {}, message.action, message.version, message.createdAt ? new Date(message.createdAt) : new Date(message.timestamp), new Date(message.timestamp), message.operation);
        };
        const paginatedResult = {};
        paginatedResult.items = data.items.map((payload) => mapToDefaultMessage(payload));
        // Recursively map the next paginated data
        paginatedResult.next = () => data.next().then((nextData) => {
            // eslint-disable-next-line unicorn/no-null
            return nextData ? this._recursivePaginateMessages(nextData) : null;
        });
        paginatedResult.first = () => data.first().then((firstData) => this._recursivePaginateMessages(firstData));
        paginatedResult.current = () => data.current().then((currentData) => this._recursivePaginateMessages(currentData));
        return Object.assign(Object.assign({}, data), paginatedResult);
    }
    deleteMessage(roomId, serial, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const body = {
                description: params === null || params === void 0 ? void 0 : params.description,
                metadata: params === null || params === void 0 ? void 0 : params.metadata,
            };
            serial = encodeURIComponent(serial);
            roomId = encodeURIComponent(roomId);
            return this._makeAuthorizedRequest(`/chat/v2/rooms/${roomId}/messages/${serial}/delete`, 'POST', body, {});
        });
    }
    sendMessage(roomId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const body = { text: params.text };
            if (params.metadata) {
                body.metadata = params.metadata;
            }
            if (params.headers) {
                body.headers = params.headers;
            }
            roomId = encodeURIComponent(roomId);
            return this._makeAuthorizedRequest(`/chat/v2/rooms/${roomId}/messages`, 'POST', body);
        });
    }
    updateMessage(roomId, serial, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const encodedSerial = encodeURIComponent(serial);
            roomId = encodeURIComponent(roomId);
            return this._makeAuthorizedRequest(`/chat/v2/rooms/${roomId}/messages/${encodedSerial}`, 'PUT', params);
        });
    }
    getOccupancy(roomId) {
        return __awaiter(this, void 0, void 0, function* () {
            roomId = encodeURIComponent(roomId);
            return this._makeAuthorizedRequest(`/chat/v1/rooms/${roomId}/occupancy`, 'GET');
        });
    }
    _makeAuthorizedRequest(url, method, body, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this._realtime.request(method, url, this._apiProtocolVersion, params, body);
            if (!response.success) {
                this._logger.error('ChatApi._makeAuthorizedRequest(); failed to make request', {
                    url,
                    statusCode: response.statusCode,
                    errorCode: response.errorCode,
                    errorMessage: response.errorMessage,
                });
                throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
            }
            return response.items[0];
        });
    }
    _makeAuthorizedPaginatedRequest(url, params, body) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this._realtime.request('GET', url, this._apiProtocolVersion, params, body);
            if (!response.success) {
                this._logger.error('ChatApi._makeAuthorizedPaginatedRequest(); failed to make request', {
                    url,
                    statusCode: response.statusCode,
                    errorCode: response.errorCode,
                    errorMessage: response.errorMessage,
                });
                throw new Ably.ErrorInfo(response.errorMessage, response.errorCode, response.statusCode);
            }
            return response;
        });
    }
}
//# sourceMappingURL=chat-api.js.map