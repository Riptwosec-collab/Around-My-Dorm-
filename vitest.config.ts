import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**"], environment: "jsdom", setupFiles: ["./tests/setup.ts"] }, resolve: { alias: { "@": new URL("./", import.meta.url).pathname } } });
