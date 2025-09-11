export const isNonSandboxEnvironment = () => process.env.VITE_ABLY_ENV && process.env.VITE_ABLY_ENV !== 'sandbox';

export const testEndpoint = () => {
  switch (process.env.VITE_ABLY_ENV) {
    case 'local': {
      return 'local-rest.ably.io';
    }
    case 'production': {
      return;
    }
    default: {
      return 'nonprod:sandbox';
    }
  }
};

export const isLocalEnvironment = () => process.env.VITE_ABLY_ENV === 'local';

export const ablyApiKey = () => (isNonSandboxEnvironment() ? process.env.VITE_ABLY_API_KEY : process.env.sandboxApiKey);
