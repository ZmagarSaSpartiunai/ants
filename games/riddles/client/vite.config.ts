import { defineConfig } from 'vite';

export default defineConfig({
  // Served under /riddles/ on the games host, so the bundle has to look
  // for its own files there. Built for the root it would ask for /assets/...
  // and get a shelf page back instead.
  base: '/riddles/',
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
  optimizeDeps: { exclude: ['@riddles/shared', '@kids/common'] },
  server: { port: 5177 },
});
