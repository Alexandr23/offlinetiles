/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { renderHeadTags, renderLlmsTxt, renderStaticLanding } from './src/modules/landing/landing.static';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

const ROOT_PLACEHOLDER = '<div id="root"></div>';

/**
 * Makes the landing page readable without running the app: injects SEO head tags, JSON-LD and
 * a semantic HTML fallback into index.html, and serves/emits /llms.txt. All of it is rendered
 * from the same copy the React page uses (src/modules/landing/landing.content.ts).
 */
function landingStatic(): Plugin {
  return {
    name: 'landing-static',
    transformIndexHtml(html) {
      if (!html.includes(ROOT_PLACEHOLDER))
        throw new Error(`landing-static: ${ROOT_PLACEHOLDER} not found in index.html`);
      return {
        html: html.replace(ROOT_PLACEHOLDER, `<div id="root">${renderStaticLanding()}</div>`),
        tags: renderHeadTags().map((tag) => ({ ...tag, injectTo: 'head' as const })),
      };
    },
    configureServer(server) {
      server.middlewares.use('/llms.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(renderLlmsTxt());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: renderLlmsTxt() });
    },
  };
}

export default defineConfig({
  plugins: [
    landingStatic(),
    react({
      babel: {
        plugins: [['babel-plugin-styled-components', { displayName: true, fileName: false }]],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // SSE needs no buffering / long timeouts
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          'style-spec': ['@maplibre/maplibre-gl-style-spec'],
          react: ['react', 'react-dom', 'styled-components'],
          drawing: ['terra-draw', 'terra-draw-maplibre-gl-adapter'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
