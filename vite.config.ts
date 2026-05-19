import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  /* Dev-server proxy — mirrors the production nginx routing rules so the
     frontend can use relative URLs (/api/*, /health) in BOTH dev and prod.
     `npm run dev` serves the SPA on :5173 and forwards /api + /health to
     the local companion on :3001. In production, nginx does the same job.
     Frontend code never needs to know which environment it's in. */
  server: {
    proxy: {
      '/api':    { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    // No source maps in production — keeps the original TypeScript / component
    // structure from being reconstructable via browser DevTools.
    sourcemap: false,
    // Drop console.log / debugger statements from the production bundle.
    minify: 'esbuild',
  },

  esbuild: {
    drop: ['console', 'debugger'],
  },
})
