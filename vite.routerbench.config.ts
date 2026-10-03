import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/tools/routerBenchmark.ts',
    outDir: 'dist-tools',
    target: 'node22',
    minify: false,
    emptyOutDir: false,
    rollupOptions: {
      external: ['dotenv', 'electron'],
      output: { format: 'es', entryFileNames: 'routerBenchmark.mjs' },
    },
  },
  logLevel: 'warn',
});