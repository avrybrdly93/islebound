import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mirrors the path aliases in ../../tsconfig.base.json. Vite does not read
// tsconfig `paths` natively; kept in sync by hand rather than pulling in
// vite-tsconfig-paths for five aliases that change rarely.
export default defineConfig({
  // React Fast Refresh. Vite gives module HMR without any plugin, but a React
  // component reloaded that way remounts and loses its state; Fast Refresh
  // preserves it, and that is the difference between "HMR works" and "HMR is
  // usable" once the overlay holds anything (BL-003).
  plugins: [react()],
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
