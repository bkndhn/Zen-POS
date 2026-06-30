import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'ZenPOS',
        short_name: 'ZenPOS',
        description: 'Point of Sale system for restaurants and hotels',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: '/brand/logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/brand/logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React core - rarely changes
            if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-'))) {
              return 'vendor-react';
            }
            // React Router
            if (id.includes('react-router')) {
              return 'vendor-router';
            }
            // Supabase client - large, rarely changes
            if (id.includes('@supabase') || id.includes('postgrest') || id.includes('gotrue') || id.includes('realtime')) {
              return 'vendor-supabase';
            }
            // Icons - very large
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Charts - only used on Dashboard/Analytics/Reports
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
              return 'vendor-charts';
            }
            // TanStack Query
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            // Radix UI primitives
            if (id.includes('@radix-ui')) {
              return 'vendor-ui';
            }
            // i18n
            if (id.includes('i18next')) {
              return 'vendor-i18n';
            }
            // date-fns
            if (id.includes('date-fns')) {
              return 'vendor-date';
            }
            // html2canvas (heavy, only used for bill image generation)
            if (id.includes('html2canvas')) {
              return 'vendor-canvas';
            }
            // QR code
            if (id.includes('qrcode')) {
              return 'vendor-qr';
            }
            // Everything else from node_modules
            return 'vendor-misc';
          }
        }
      }
    }
  }
}));
