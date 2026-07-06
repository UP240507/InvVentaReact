import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Runtime JSX automático → no requiere `import React` en componentes ni tests.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/store/**'],
      reporter: ['text', 'html'],
    },
  },
});
