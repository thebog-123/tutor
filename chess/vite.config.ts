/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` lets the build work at a domain root or any sub-path (the app uses hash routes).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Don't pick up PostCSS config from the parent repository.
  css: { postcss: { plugins: [] } },
  build: { target: 'es2020', sourcemap: false },
  test: { include: ['src/**/*.test.ts'], testTimeout: 60000 },
});
