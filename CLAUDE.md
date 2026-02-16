# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Ably Chat JavaScript/TypeScript SDK (`@ably/chat`) - a chat SDK built on Ably's Realtime client providing messaging, presence, typing indicators, reactions, and occupancy. Supports JavaScript, TypeScript, React, and React Native.

## Commands

### Build
```bash
npm run build              # Build all (chat, core, react)
npm run build:chat         # Main chat bundle
npm run build:core         # Core SDK (no React)
npm run build:react        # React bindings
```

### Test
```bash
npm test                   # All tests with coverage
npm run test:chat          # Core tests only (vitest project: "chat")
npm run test:react         # React tests only (vitest project: "react-hooks")
npm run test:unit          # All tests excluding integration
npm run test:chat-unit     # Core unit tests only
npm run test:react-unit    # React unit tests only
npm run test:typescript    # Type-check only (no tests)
npm run test:watch         # Watch mode

# Run a single test file
npm test -- test/core/messages.test.ts

# Run tests matching a pattern
npm test -- -t "should send a message"
```

Unit tests mock `ably` via `vi.mock('ably')` with mocks in `__mocks__/`. Integration tests (`*.integration.test.ts`) connect to Ably sandbox - no mocking.

### Lint & Format
```bash
npm run precommit          # Run before committing: format:check + lint + test:typescript
npm run lint               # ESLint + cspell + docs:lint
npm run lint:fix           # Auto-fix lint and format issues
npm run format             # Auto-format with Prettier
npm run format:check       # Check Prettier formatting
npm run check:error-codes  # Validate ErrorCode enum values exist in ably-common/protocol/errors.json
```

### Demo App
```bash
npm run build:start-demo   # Build SDK then start demo
npm run demo:reload        # Rebuild SDK and reinstall in demo app
```

## Architecture

### Three Build Targets

The SDK ships three packages from a single repo (not a monorepo - single `package.json`):

| Export | Source | Output | Dependencies |
|---|---|---|---|
| `@ably/chat` | `src/core/` + `src/index.ts` | `dist/chat/` (ESM + UMD) | `ably` (peer) |
| `@ably/chat` (core only) | `src/core/` | `dist/core/` | `ably` (external) |
| `@ably/chat/react` | `src/react/` | `dist/react/` (ESM + UMD) | `ably`, `react` (peers) |

Each has its own `vite.config.ts` using Vite library mode with `vite-plugin-dts` for type generation.

### Core SDK (`src/core/`)

Key class hierarchy:
- **`ChatClient`** → entry point, provides `rooms` collection and manages Ably Realtime connection
- **`Rooms`** → manages `Room` instances (get/release)
- **`Room`** → chat room with feature accessors: `messages`, `presence`, `reactions`, `typing`, `occupancy`
- **`RoomLifecycleManager`** → orchestrates room state (attach/detach) coordinating features via `ChannelManager`
- **`ChannelManager`** → manages the underlying Ably channel shared by all features in a room

Each feature (Messages, Presence, Typing, RoomReactions, Occupancy, MessageReactions) is a separate class handling its own subscriptions and state. REST operations go through `ChatApi`.

### React SDK (`src/react/`)

- **Providers**: `ChatClientProvider`, `ChatRoomProvider` (context-based DI)
- **Hooks**: `useMessages`, `usePresence`, `usePresenceListener`, `useTyping`, `useRoomReactions`, `useOccupancy`, `useRoom`, `useChatClient`, `useChatConnection`

Hooks use `useCallback`/`useMemo` for memoization, refs (`useRef`) for values that shouldn't trigger re-renders, and must clean up subscriptions/listeners on unmount.

### Public API Exports

All public types/interfaces must be exported from `src/core/index.ts` or `src/react/index.ts`. Update these when adding or changing public API surface.

## Coding Conventions

### TypeScript
- Import ably as: `import * as Ably from 'ably'`
- Use relative imports within the project
- File extension in imports: `import { Foo } from './foo.js'` (enforced by `import/extensions` rule)
- Prefer arrow functions (enforced by eslint)
- Named exports only - no default exports
- PascalCase for types/interfaces/enums/classes; camelCase for members; `_underscore` prefix for private members
- Implement interfaces explicitly; avoid class inheritance wherever possible
- No `any` - use `unknown` if unavoidable, prefer strong typing
- Files use kebab-case
- JSDoc all public interfaces and methods with `@param`, `@returns`, `@throws`, and `{@link Type}` references. Document properties inline alongside the property.

### Error Handling
- Error type: `Ably.ErrorInfo(message, code, statusCode)`
- Error codes: `ErrorCode` enum in `src/core/errors.ts` - values must exist in `ably-common/protocol/errors.json` (validated by `npm run check:error-codes`)
- Status code derivation: for error codes in the 10000-59999 range, the statusCode is the HTTP status matching the first 3 digits (e.g., code `40003` → statusCode `400`)
- **Error message format**: `"unable to <operation>; <reason>"` - always lowercase, semicolon separator
  - `"unable to send message; room is not attached"`
  - NOT: `"cannot..."`, `"could not..."`, `"failed to..."`

### Logging
- Key operations get `_logger.trace()` at entry; use `_logger.debug()` / `_logger.error()` with context objects
- Never log Ably channel instances

### Feature Specification
Code is backed by a feature spec with points like `CHA-M10a`. `@[Testable]@` spec points require tests.
- Code annotations: `// @CHA-M10a`
- Test annotations: `// CHA-M10a`

## Testing Conventions

### Unit Tests
- Framework: Vitest (`describe`, `it`, `expect`)
- Mock ably: `vi.mock('ably')` at top of file
- Custom matchers from `test/helper/expectations.ts`: `toBeErrorInfo()`, `toThrowErrorInfo()`, `toBeErrorInfoWithCode()`, `toThrowErrorInfoWithCode()`, `toBeErrorInfoWithCauseCode()`
- For async rejection testing: `await expect(() => asyncFn()).rejects.toBeErrorInfo({ code: 40000 })`
- Arrange-Act-Assert pattern; data-driven tests with `.each()`
- Use random room IDs to avoid conflicts

### Integration Tests
- Files: `*.integration.test.ts` - connect to real Ably sandbox, no mocking
- Use `newChatClient()` helper for fully connected clients
- Use `vi.waitFor()` for async event waiting
- Set appropriate timeouts: `describe('...', { timeout: 10000 }, () => { ... })`
- Use typed `TestContext` pattern: define a `TestContext` interface, then use `beforeEach<TestContext>` and `it<TestContext>` to share setup across tests

### React Hook Tests
- Environment: jsdom (configured in vitest.config.ts)
- Use `waitForEventualHookValue()` / `waitForEventualHookValueToBeDefined()` from `test/helper/wait-for-eventual-hook.ts`

### Coverage Thresholds
95% statements, 97% branches, 98% functions, 95% lines.

## Project Structure

```text
src/core/           Core TypeScript SDK implementation
src/react/          React hooks and providers
test/core/          Core SDK tests (unit + integration)
test/react/         React SDK tests
test/helper/        Test utilities, custom matchers, setup
__mocks__/          Module mocks (ably)
demo/               Demo React app (separate package.json)
ably-common/        Git submodule - shared Ably protocol resources (errors.json)
scripts/            Build and validation scripts
```

## Version Updates

When releasing, see the guide in `CONTRIBUTING.md`.
