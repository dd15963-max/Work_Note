import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "react-work-note",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});