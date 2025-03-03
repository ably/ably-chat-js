import { ChatClientOptions, normalizeClientOptions, NormalizedChatClientOptions } from '../../src/core/config.js';
import { LogLevel } from '../../src/core/logger.js';

const defaults: NormalizedChatClientOptions = {
  logLevel: LogLevel.Error,
};

export const testClientOptions = (options?: ChatClientOptions): NormalizedChatClientOptions => {
  options = options ?? defaults;
  return normalizeClientOptions(options);
};
