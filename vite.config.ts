import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // CommonJS, not ESM. Electron's ESM main-process loader does not
            // intercept the 'electron' specifier, so an ESM bundle resolves it to
            // the node_modules stub instead of the runtime module and every
            // Electron API comes back undefined. require() is always correct.
            // lib is disabled because the plugin forces output.format = 'es'
            // when lib mode is on.
            lib: false,
            rollupOptions: {
              input: 'src/main/main.ts',
              external: ['electron'],
              // env.ts reads import.meta.url defensively and handles its absence
              // at runtime, which is correct but not something Rollup can see.
              // The warning would otherwise print on every build.
              onwarn(warning, defaultHandler) {
                if (warning.code === 'EMPTY_IMPORT_META') return;
                defaultHandler(warning);
              },
              output: {
                format: 'cjs',
                entryFileNames: 'main.cjs',
              },
            },
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // The plugin sets build.lib (formats: ['es']) which makes Vite force
            // output.format = 'es'. A sandboxed Electron preload must be CommonJS,
            // so lib mode is disabled and the format is set explicitly instead.
            lib: false,
            rollupOptions: {
              input: 'src/main/preload.ts',
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
});
