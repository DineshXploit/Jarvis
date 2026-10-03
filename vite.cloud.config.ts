import { defineConfig } from 'vite';

/**
 * Cloud backend bundle.
 *
 * Separate from vite.config.ts because the desktop build produces an Electron
 * main process and a renderer, neither of which belongs in a container. This
 * build emits exactly one Node-targeted ESM entry with Electron, Vite and the
 * renderer tree all excluded, so the image does not carry them.
 *
 * ESM is emitted rather than CJS: package.json declares "type": "module", so a
 * .js file is ESM and no extension juggling is needed.
 */
export default defineConfig({
  build: {
    ssr: 'src/cloud/index.ts',
    outDir: 'dist-cloud',
    target: 'node22',
    // Readable stack traces matter more than bytes in a container log.
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      // Anything resolved at runtime must not be bundled.
      external: ['dotenv', 'electron'],
      output: {
        format: 'es',
        entryFileNames: 'server.js',
        chunkFileNames: '[name]-[hash].js',
      },
    },
  },
  ssr: {
    // Keeps the Node target explicit so no browser polyfills creep in.
    target: 'node',
  },
  logLevel: 'warn',
});