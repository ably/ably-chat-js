const randomString = (): string => Math.random().toString(36).slice(7);

const randomClientId = (): string => 'ably-chat-js-client-' + randomString();

const randomRoomId = (): string => 'ably-chat-js-room-' + randomString();

export { randomClientId, randomRoomId, randomString };
