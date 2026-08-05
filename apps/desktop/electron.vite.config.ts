import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const resolveFromApp = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@gtrz/contracts', '@gtrz/database', '@gtrz/domain'],
      }),
    ],
    build: {
      rollupOptions: {
        external: ['better-sqlite3'],
        input: resolveFromApp('./src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@gtrz/contracts'],
      }),
    ],
    build: {
      rollupOptions: {
        input: resolveFromApp('./src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolveFromApp('./src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolveFromApp('./src/renderer/src'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolveFromApp('./src/renderer/index.html'),
      },
    },
  },
});
