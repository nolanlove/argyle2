/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite is rooted at `mobile/`. Build output goes into the Django staticfiles
// directory at `../static/mobile/` so whitenoise + Django's {% static %} can
// serve it. `base` matches the URL prefix Django serves static assets from.
export default defineConfig({
  plugins: [react()],
  base: '/static/mobile/',
  build: {
    outDir: resolve(__dirname, '../static/mobile'),
    emptyOutDir: true,
    sourcemap: true,
    // Fixed bundle names keep the Django template's <script>/<link> tags
    // simple — no manifest plumbing needed for Phase 1.
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'index.css';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to Django dev server during `npm run dev`.
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
