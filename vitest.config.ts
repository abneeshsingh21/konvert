import { defineConfig } from "vitest/config";
import * as path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/test/vscodeMock.ts')
    }
  },
  test: {
    include: ["src/**/*.test.ts"],
    globals: true,
    testTimeout: 10000,
  },
});
