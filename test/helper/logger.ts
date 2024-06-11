import { LogLevel, Logger, makeLogger } from '../../src/logger.js';

export const makeTestLogger = (): Logger => {
  const level = (process.env.VITE_TEST_LOG_LEVEL as LogLevel) ?? LogLevel.silent;
  return makeLogger({ logLevel: level, typingTimeoutMs: 1000 });
};
