import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// (Tauri) Dentro del contenedor Tauri el service worker/PWA se DESACTIVA:
// el SW compite con el protocolo local del WebView y no aporta nada ahí
// (el offline lo da Dexie). La build web normal lo conserva intacto.
const esTauri = !!globalThis.process?.env?.TAURI_ENV_PLATFORM;

export default defineConfig({
  // Requisitos de `tauri dev`: consola sin limpiar y puerto FIJO (si 5173
  // está ocupado, mejor fallar que abrir la ventana contra otro puerto).
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [
    react(),
    ...(esTauri
      ? []
      : [
    VitePWA({
      registerType: 'autoUpdate', // Se actualiza sola cuando liberas nueva versión
      injectRegister: 'auto',

      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'safari-pinned-tab.svg',
      ],

      manifest: {
        name: 'InvVenta',
        short_name: 'InvVenta',
        description: 'Sistema Operativo y Punto de Venta Gastronómico',
        theme_color: '#0f172a', // Color obsidiana del modo oscuro
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        sourcemap: true,

        // ✅ FALLBACK SPA: cualquier navegación (recargar /pos, /dashboard, etc.)
        // sin red devuelve el index.html precacheado → la app SIEMPRE arranca offline.
        navigateFallback: 'index.html',
        // No aplicar el fallback a estas rutas (deben ir a la red / no son rutas de la app).
        navigateFallbackDenylist: [
          /^\/api\//, // APIs propias
          /supabase\.co/, // Supabase REST/Auth/Realtime
          /\/rest\//, // PostgREST
          /\/auth\//, // Supabase Auth
          /\/rpc\//, // RPCs
          /\.[^/]+$/, // peticiones con extensión (assets) → no servir index.html
        ],

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
        ]),
  ],
});
