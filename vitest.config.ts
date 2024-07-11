import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['src/**/*'],
      exclude: ['src/utils/**/*'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      provider: 'istanbul',
      thresholds: {
        statements: 92,
        branches: 86,
        functions: 95,
        lines: 92,
      },
    },
  },
});
