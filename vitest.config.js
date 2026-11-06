import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20000,
    // Rules tests share one emulator database; run files one at a time.
    fileParallelism: false,
  },
});
