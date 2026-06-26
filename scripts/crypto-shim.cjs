// Build-time shim: expose the Web Crypto API as a global in every thread.
//
// vite-plugin-pwa minifies the generated service worker with @rollup/plugin-terser,
// which runs terser inside worker_threads. On Node < 20 the `crypto` web-global is
// only present on the main thread, so a transitive dep (serialize-javascript) that
// reads bare `crypto` at module load throws "crypto is not defined" in the worker.
// Preloading this via NODE_OPTIONS=--require fixes the main thread and all workers.
if (!globalThis.crypto) {
  globalThis.crypto = require('node:crypto').webcrypto;
}
