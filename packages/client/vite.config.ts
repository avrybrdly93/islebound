import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Mirrors the path aliases in ../../tsconfig.base.json. Vite does not read
// tsconfig `paths` natively; kept in sync by hand rather than pulling in
// vite-tsconfig-paths for five aliases that change rarely.
export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@sim': fileURLToPath(new URL('./src/sim', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@content': fileURLToPath(new URL('../shared/src/content', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
