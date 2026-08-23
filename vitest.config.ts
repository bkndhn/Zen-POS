import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      // Load Vite env vars into process.env for the auth tests
      ...process.env,
    },
    setupFiles: ['src/tests/setupEnv.ts'],
  },
});
