export {};

declare module '../core/chat.js' {
  interface ChatClient {
    addReactAgent(): void;
    addAgentWithVersion(agent: string, version: string): void;
  }
}
