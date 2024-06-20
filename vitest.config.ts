import { configDefaults, defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    globalSetup: './test/helper/testSetup.ts',
    exclude: [...configDefaults.exclude, 'ably-common/**'],
  },
});
