import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'shared', root: './packages/shared', environment: 'node' } },
      { test: { name: 'city-pipeline', root: './tools/city-pipeline', environment: 'node' } },
      { test: { name: 'web', root: './apps/web', environment: 'node', include: ['src/**/*.test.ts'] } },
      { test: { name: 'functions', root: './functions', environment: 'node' } },
    ],
  },
});
