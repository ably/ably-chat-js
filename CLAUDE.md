# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the Ably Chat JavaScript/TypeScript SDK (`@ably/chat`), a purpose-built chat SDK that provides abstractions for chat features like messaging, presence, typing indicators, reactions, and occupancy. It is built on top of Ably's Realtime client and supports JavaScript, TypeScript, React, and React Native platforms.

## Build and Development Commands

### Building
```bash
npm run build              # Build all packages (chat, core, react)
npm run build:chat         # Build the main chat SDK
npm run build:core         # Build the core SDK
npm run build:react        # Build the React SDK
```

### Testing
```bash
npm test                   # Run all tests
npm run test:chat          # Run core chat tests only
npm run test:react         # Run React hooks tests only
npm run test:unit          # Run unit tests only (exclude integration tests)
npm run test:chat-unit     # Run core unit tests only
npm run test:react-unit    # Run React unit tests only
npm run test:watch         # Run tests in watch mode
npm run test:typescript    # Type-check the codebase
```

Integration tests connect to a real Ably sandbox environment. Unit tests mock the `ably` library using `vi.mock('ably')`.

### Linting and Formatting
```bash
npm run lint               # Run ESLint, cspell, and docs lint
npm run lint:fix           # Fix linting errors automatically
npm run format             # Format code with Prettier
npm run format:check       # Check formatting without fixing
npm run precommit          # Run format:check, lint, and test:typescript
```

### Documentation
```bash
npm run docs               # Generate TypeDoc documentation
npm run docs:lint          # Lint documentation without generating
```

### Demo Application
```bash
npm run demo:reload        # Rebuild SDK and reinstall in demo app
npm run build:start-demo   # Build SDK and start demo server
```

## Architecture

### Core SDK (`src/core/`)

The core SDK is organized around a hierarchy of key classes:

- **`ChatClient`**: Entry point for the SDK. Provides access to `rooms` and manages the underlying Ably Realtime connection. Each client must have a `clientId`.
- **`Room`**: Represents a chat room and provides access to room features via properties:
  - `messages`: Send, receive, and query messages
  - `presence`: Monitor and manage user presence
  - `reactions`: Room-level reactions
  - `typing`: Typing indicators
  - `occupancy`: Real-time occupancy metrics
  - Room lifecycle: `attach()`, `detach()`, `status`, `onStatusChange()`
- **Room Features**: Each feature (Messages, Presence, Typing, RoomReactions, Occupancy, MessageReactions) is implemented as a separate class that handles its own channel subscriptions and state management.
- **Room Lifecycle**: Managed by `RoomLifecycleManager` which coordinates feature lifecycle with the underlying Ably channel state via `ChannelManager`.

### React SDK (`src/react/`)

The React SDK provides hooks and providers for integrating chat functionality into React applications:

- **Providers**: `ChatClientProvider`, `ChatRoomProvider` - Provide context for hooks
- **Hooks**: Custom hooks like `useMessages`, `usePresence`, `useTyping`, `useRoomReactions`, `useOccupancy` that wrap the core SDK functionality with React-friendly APIs
- Hooks follow React conventions: use `useCallback`, `useMemo`, refs for non-reactive values, and proper cleanup

### Key Concepts

- **Feature Specification**: Code is backed by a specification with points like `CHA-M10a`. All `@[Testable]@` spec points MUST have corresponding tests. Include spec point comments in both code (`// @CHA-M10a`) and tests (`// CHA-M10a`).
- **Error Handling**: Uses `ErrorInfo` from `ably` package. Error codes defined in `ErrorCodes` enum in `src/core/errors.ts`. Format: `new Ably.ErrorInfo(message, code, statusCode)`.
- **Logging**: All key operations have trace-level logs. Use `_logger.trace()`, `_logger.debug()`, `_logger.error()` with context objects. Never log Ably channel instances.
- **Channel Management**: Features share a single channel per room through `ChannelManager`, which merges channel options from different features.

## TypeScript Conventions

- Use relative imports within the project
- Import Ably as: `import * as Ably from 'ably'`
- Use PascalCase for classes, interfaces, enums
- Use underscore prefix for private members: `_roomId`, `_channel`
- Avoid `any`; use `unknown` if necessary, but prefer strong typing
- Use async/await over raw promises
- Export public API types in `src/core/index.ts` or `src/react/index.ts`

## Testing Conventions

### Unit Tests
- Mock the `ably` library: `vi.mock('ably')`
- Use Vitest framework with `describe`, `it`, `expect`
- Use custom matchers from `test/helper/expectations.ts`:
  - `toBeErrorInfo()`, `toThrowErrorInfo()` for error testing
  - `toBeErrorInfoWithCode()`, `toThrowErrorInfoWithCode()` for code-specific errors
- Follow Arrange-Act-Assert pattern
- Use data-driven tests with `.each()` when appropriate

### Integration Tests
- Files end with `.integration.test.ts` or `.integration.test.tsx`
- Connect to real Ably sandbox service (no mocking)
- Use `newChatClient()` helper to create fully connected clients
- Use `vi.waitFor()` for async event waiting
- Use random room IDs to avoid conflicts

### Test Organization
- Unit tests in `test/core/` mirror `src/core/`
- React tests in `test/react/` mirror `src/react/`
- Include spec point comments in tests: `// CHA-M10a`
- Always update tests when making code changes

## File Conventions

- Use kebab-case for TypeScript and TSX files
- Project structure:
  - `src/core/`: Core TypeScript SDK
  - `src/react/`: React hooks and providers
  - `test/core/`: Core SDK tests
  - `test/react/`: React SDK tests
  - `demo/`: Demo React application

## Development Guidelines

- **Keep It Simple**: Only make requested changes. Suggest improvements separately.
- **Always Update Tests**: Modify tests whenever source code changes. Run tests to catch regressions.
- **Run Tests After Changes**: Always run relevant tests after making code or test changes.
