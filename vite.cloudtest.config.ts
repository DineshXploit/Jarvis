import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/tools/cloudTest.ts',
    outDir: 'dist-tools',
    target: 'node22',
    minify: false,
    emptyOutDir: false,
    rollupOptions: {
      external: ['dotenv', 'electron'],
      output: { format: 'es', entryFileNames: 'cloudTest.mjs' },
    },
  },
  logLevel: 'warn',
});