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
  // The simulation is a workspace package, so Vite would happily pre-bundle it
  // once and keep serving that copy after a rebuild -- which means playing an
  // old set of rules while the source says otherwise.
  optimizeDeps: { exclude: ['@ants/shared'] },
  server: {
    port: 5173,
    watch: { ignored: ['!**/shared/dist/**'] },
    proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
});
