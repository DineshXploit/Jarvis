import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/tools/securityTest.ts',
    outDir: 'dist-tools',
    target: 'node22',
    minify: false,
    emptyOutDir: false,
    rollupOptions: {
      external: ['dotenv', 'electron'],
      output: {
        format: 'es',
        entryFileNames: 'securityTest.mjs',
      },
    },
  },
  logLevel: 'warn',
});