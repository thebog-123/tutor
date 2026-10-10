/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` lets the same build work at a domain root or a sub-path such as
// https://<user>.github.io/<repo>/ (the app uses hash routes, so no server rewrites are needed).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Don't pick up PostCSS config from the parent repository.
  css: { postcss: { plugins: [] } },
  build: { target: 'es2020', sourcemap: false },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
});
