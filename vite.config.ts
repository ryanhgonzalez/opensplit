/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Offline support. Every file the app can ever request — the shell, the
    // lazy PDF and OCR chunks, and the OCR worker/core/language data under
    // public/tesseract — is precached at install time, so once the PWA has
    // been opened once it never needs the network again.
    VitePWA({
      registerType: 'autoUpdate',
      // public/manifest.webmanifest is hand-written and already linked from
      // index.html; let it stand rather than generating a second one.
      manifest: false,
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,gz}'],
        // The OCR core files are ~4 MB each, above workbox's 2 MB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    // Node, not jsdom: everything under test is pure calculation or store logic.
    // The only browser API the store touches is localStorage, which the setup
    // file stubs — cheaper and faster than pulling in a DOM implementation.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
