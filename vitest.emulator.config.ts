import { defineConfig } from 'vitest/config';

// Testes de regras e das Cloud Functions contra os emuladores (npm run test:emulator).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false,
  },
});
