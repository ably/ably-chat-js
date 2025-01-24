import { LogLevel } from './logger.js';
/**
 * Default configuration options for the chat client.
 */
const defaultClientOptions = {
    logLevel: LogLevel.Error,
};
export const normalizeClientOptions = (options) => {
    var _a;
    options = options !== null && options !== void 0 ? options : {};
    return Object.assign(Object.assign({}, options), { logLevel: (_a = options.logLevel) !== null && _a !== void 0 ? _a : defaultClientOptions.logLevel });
};
//# sourceMappingURL=config.js.map