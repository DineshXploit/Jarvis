import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/tools/nvidiaTest.ts',
    outDir: 'dist-tools',
    target: 'node22',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      external: ['dotenv', 'electron'],
      output: {
        format: 'es',
        entryFileNames: 'nvidiaTest.mjs',
      },
    },
  },
  logLevel: 'warn',
});
