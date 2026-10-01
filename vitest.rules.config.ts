import { defineConfig } from 'vitest/config';

// Testes das regras do Firestore e do Storage. Rodam dentro de `firebase emulators:exec` (npm run test:rules).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false,
  },
});
