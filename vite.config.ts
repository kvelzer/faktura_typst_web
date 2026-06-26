import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // typst.ts dynamically imports the wasm wrapper packages; keep them out of
  // Vite's dep pre-bundling so the wasm assets resolve correctly.
  optimizeDeps: {
    exclude: [
      '@myriaddreamin/typst.ts',
      '@myriaddreamin/typst-ts-web-compiler',
      '@myriaddreamin/typst-ts-renderer',
    ],
  },
  build: {
    target: 'es2022',
  },
  preview: {
    allowedHosts: ['faktura.toanhquan.com'],
  },
  server: {
    allowedHosts: ['faktura.toanhquan.com'],
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        id: '/',
        name: 'Faktura PWA',
        short_name: 'Faktura',
        description: 'Fakturace pro OSVČ neplátce DPH — PDF přímo v prohlížeči, offline.',
        lang: 'cs',
        theme_color: '#111111',
        background_color: '#f4f4f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'finance', 'productivity'],
        prefer_related_applications: false,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell AND the heavy offline assets: wasm + fonts.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,ttf,otf,woff,woff2}'],
        // typst wasm can be large; lift the default precache size limit.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            // Belt-and-suspenders: anything wasm/font fetched at runtime is cached.
            urlPattern: ({ url }) => /\.(?:wasm|ttf|otf|woff2?)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'typst-assets',
              expiration: { maxEntries: 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
