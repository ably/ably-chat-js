export const isNonSandboxEnvironment = () => {
  return process.env.VITE_ABLY_ENV && process.env.VITE_ABLY_ENV !== 'sandbox';
};

export const testEnvironment = () => {
  return process.env.VITE_ABLY_ENV ?? 'sandbox';
};

export const isLocalEnvironment = () => {
  return process.env.VITE_ABLY_ENV === 'local';
};

export const ablyApiKey = () => {
  return isNonSandboxEnvironment() ? process.env.VITE_ABLY_API_KEY : process.env.sandboxApiKey;
};
