import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/tools/level2Test.ts',
    outDir: 'dist-tools',
    target: 'node22',
    minify: false,
    emptyOutDir: false,
    rollupOptions: {
      external: ['dotenv', 'electron'],
      output: { format: 'es', entryFileNames: 'level2Test.mjs' },
    },
  },
  logLevel: 'warn',
});
