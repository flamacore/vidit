import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['ffmpeg-static', 'ffprobe-static', 'electron'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['electron'],
              output: {
                // Electron preload must be CJS — ESM .mjs with require() breaks contextBridge
                format: 'cjs',
                entryFileNames: '[name].cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
      // No node integration in renderer — omit vite-plugin-electron-renderer
    }),
  ],
  base: './',
  server: {
    port: 5173,
  },
})
