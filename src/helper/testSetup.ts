import testAppSetup from '../../ably-common/test-resources/test-app-setup.json';

// Setup creates a new app in the sanbox environment and sets the key
// This is called automatically by vitest before the tests are run.
const setup = async () => {
  const response = await fetch('https://sandbox-rest.ably.io/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testAppSetup.post_apps),
  });

  if (!response.ok) {
    throw new Error(`Response not OK (${response.status})`);
  }

  const testApp = await response.json();

  // The key we need to use is the one at index 5, which gives enough permissions
  // to interact with Chat and Channels
  process.env.testAblyApiKey = testApp.keys[5].keyStr;
};

export { setup };
