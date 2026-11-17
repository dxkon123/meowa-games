import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: {
    charset: 'ascii',
  },
  server: {
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**'],
    },
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
