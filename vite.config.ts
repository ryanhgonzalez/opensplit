/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Node, not jsdom: everything under test is pure calculation or store logic.
    // The only browser API the store touches is localStorage, which the setup
    // file stubs — cheaper and faster than pulling in a DOM implementation.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
