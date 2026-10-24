import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020', assetsInlineLimit: 8192 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
