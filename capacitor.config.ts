import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the Android client.
 *
 * JARVIS desktop is an Electron main process plus a renderer. On Android only
 * the renderer exists: there is no local backend process, so every capability
 * that used to be an IPC call becomes an HTTP call to the cloud backend, and the
 * mobile bridge (src/ui/mobileBridge.ts) implements the same `window.jarvisAPI`
 * surface the Electron preload exposes.
 *
 * webDir points at the Vite renderer output. `npm run build` must run before
 * `npx cap copy android` or the APK ships the previous build.
 */
const config: CapacitorConfig = {
  appId: 'com.jarvis.assistant',
  appName: 'JARVIS',
  webDir: 'dist',

  // Rendered through a WebView, so the same origin policy and CSP rules apply
  // as on desktop. Needed because the renderer loads no remote content itself.
  server: {
    androidScheme: 'https',
    // The renderer is bundled, so no live-reload server is required. Reloading
    // from disk keeps the app working offline for UI concerns.
    cleartext: false,
  },

  android: {
    // The renderer only ever talks to the cloud backend over HTTPS.
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#04060c',
    },
  },
};

export default config;