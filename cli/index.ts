import {Chat} from "@ably-labs/chat"
import { Realtime, Rest } from 'ably/promises';
import { program } from "commander";

const ABLY_KEY: string = process.env.ABLY_CLI_KEY as string
if (!ABLY_KEY) {
  console.error('ABLY_CLI_KEY is not set')
  process.exit(1)
}


// Function to create tokens for the chat client
const clientId = 'ably-chat-cli'
const restClient = new Rest({
  key: ABLY_KEY,
  clientId: clientId,
  restHost: "local-rest.ably.io",
  realtimeHost: "local-rest.ably.io",
  tls: false,
  port: 8081,
});

// Realtime client for chat
const realtimeClient = new Realtime({
    authCallback: async (_, callback) => {

        const tokenRequestData = await restClient.auth.createTokenRequest({
            capability: {
            'conversations:*': ['publish', 'subscribe', 'presence'],
            '[conversation]*': ['publish', 'create', 'history', 'edit-all', 'delete-all'],
            },
            clientId: clientId,
        });

        callback(null, tokenRequestData)
    },
    restHost: "local-rest.ably.io",
    realtimeHost: "local-rest.ably.io",
    tls: false,
    port: 8081,
    useBinaryProtocol: false,
    autoConnect: false,
});

// Chat client
const chat = new Chat(realtimeClient);

// Conversation commands
const conversations = program.command('conversation')
    .description('Conversation commands');

// Create
conversations.command('create <conversationId>')
    .description('Create a conversation')
    .action(async (conversationId: string) => {
        try {
            await chat.conversations.get(conversationId).create();
            console.log(`Conversation created: ${conversationId}`);
        } catch (e) {
            console.error('Failed to create conversation', e);
        }
    });

// Delete
conversations.command('delete <conversationId>')
    .description('Delete a conversation')
    .action(async (conversationId: string) => {
        try {
            await chat.conversations.get(conversationId).delete();
            console.log(`Conversation deleted: ${conversationId}`);
        } catch (e) {
            console.error('Failed to delete conversation', e);
        }
    });


// Message commands
const messages = program.command('message')
    .description('Message commands');

// Send
messages.command('send <conversationId> <message>')
    .description('Send a message to a conversation')
    .action(async (conversationId: string, message: string) => {
        try {
            const messageObject = await chat.conversations.get(conversationId).messages.send(message);
            console.log(`Message id: ${messageObject.id}`);
        } catch (e) {
            console.error('Failed to send message', e);
        }
    });

// Get
messages.command('get <conversationId> <messageId>')
    .description('Get a message from a conversation')
    .action(async (conversationId: string, messageId: string) => {
        try {
            const message = await chat.conversations.get(conversationId).messages.get(messageId);
            console.log(`Message: ${JSON.stringify(message)}`);
        } catch (e) {
            console.error('Failed to get message', e);
        }
    });

// Edit
messages.command('edit <conversationId> <messageId> <message>')
    .description('Edit a message in a conversation')
    .action(async (conversationId: string, messageId: string, message: string) => {
        try {
            await chat.conversations.get(conversationId).messages.edit(messageId, message);
            console.log(`Message edited: ${message}`);
        } catch (e) {
            console.error('Failed to edit message', e);
        }
    });

// Delete
messages.command('delete <conversationId> <messageId>')
    .description('Delete a message from a conversation')
    .action(async (conversationId: string, messageId: string) => {
        try {
            await chat.conversations.get(conversationId).messages.delete(messageId);
            console.log(`Message deleted: ${messageId}`);
        } catch (e) {
            console.error('Failed to delete message', e);
        }
    });


// Reaction commands
const reactions = messages.command('reaction')
    .description('Reaction commands');

// Add
reactions.command('add <conversationId> <messageId> <reaction>')
    .description('Add a reaction to a message')
    .action(async (conversationId: string, messageId: string, reaction: string) => {
        try {
            await chat.conversations.get(conversationId).messages.get(messageId).reactions.add(reaction);
            console.log(`Reaction added: ${reaction}`);
        } catch (e) {
            console.error('Failed to add reaction', e);
        }
    });

// Delete
reactions.command('delete <conversationId> <messageId> <reactionId>')
    .description('Delete a reaction')
    .action(async (conversationId, messageId, reactionId) => {
        throw new Error(`Not implemented {conversationId: ${conversationId}, messageId: ${messageId}, reactionId: ${reactionId}}`)
        // try {
        //     await chat.conversations.get(conversationId).messages.removeReaction(reactionId);
        //     console.log(`Reaction deleted: ${reactionId}`);
        // } catch (e) {
        //     console.error('Failed to delete reaction', e);
        // }
    });

// History commands
const history = program.command('history')
    .description('History commands');

// Get
history.command('get <conversationId> [startId] [endId]')
    .description('Get messages from a conversation')
    .action(async (conversationId: string, startId: string, endId: string) => {
        try {
            const messages = await chat.conversations.get(conversationId).messages.query({ startId, endId, limit: 100 });
            console.log(`Messages: ${JSON.stringify(messages)}`);
        } catch (e) {
            console.error('Failed to get messages', e);
        }
    });

// Seed creates a conversation, sends 10 message and adds index number of reactions
program.command('seed <conversationId>')
    .description('Seed a conversation with messages')
    .action(async (conversationId: string) => {
        try {
            const conversation = chat.conversations.get(conversationId);
            await conversation.create();
            for (let i = 0; i < 10; i++) {
                const message = await conversation.messages.send(`Message ${i}`);

                for (let j = 0; j < i; j++) {
                    await conversation.messages.addReaction(message.id, `like_${(j % 5).toString()}`);
                }
            }
            console.log(`Seeded conversation: ${conversationId}`);
        } catch (e) {
            console.error('Failed to seed conversation', e);
        }
    });

// Parse things
program.parse(process.argv);
