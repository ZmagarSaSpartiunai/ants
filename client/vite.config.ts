import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // One bundle, everything inlined: the game must survive being dropped on a
    // portal as a static folder with no CDN reachable.
    assetsInlineLimit: 1024 * 1024,
    cssCodeSplit: false,
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
});
