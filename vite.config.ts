/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base './' : le build est 100 % statique et fonctionne sous n'importe quel
// sous-chemin (GitHub Pages /ovalgun/, Cloudflare Pages à la racine…).
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
