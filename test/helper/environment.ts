export const isNonSandboxEnvironment = () => process.env.VITE_ABLY_ENV && process.env.VITE_ABLY_ENV !== 'sandbox';

export const testEnvironment = () => process.env.VITE_ABLY_ENV ?? 'sandbox';

export const isLocalEnvironment = () => process.env.VITE_ABLY_ENV === 'local';

export const ablyApiKey = () => (isNonSandboxEnvironment() ? process.env.VITE_ABLY_API_KEY : process.env.sandboxApiKey);
