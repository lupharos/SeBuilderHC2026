import { defineConfig } from 'vite'
import path from 'path'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/* Build-time metadata baked into the bundle.
   ───────────────────────────────────────────────────────────────────
   The wizard shows a tiny version chip in the nav rail so the SE can
   tell at a glance which commit is deployed (handy when bug-reporting
   from customer engagements). Three signals are exposed:
     • commit  — git short SHA, the canonical "what code is live"
     • builtAt — UTC ISO timestamp of the build
     • version — package.json version, for human-readable major bumps
   `git rev-parse` runs once at config time. If git isn't available
   (e.g. building from a tarball without .git) we fall back to a
   placeholder so the build doesn't fail. */
function readBuildInfo() {
  let commit = 'nogit'
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || 'nogit'
  } catch { /* keep placeholder */ }
  let dirty = false
  try {
    const status = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    dirty = status.length > 0
  } catch { /* keep clean */ }
  let version = '0.0.0'
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))
    if (typeof pkg.version === 'string') version = pkg.version
  } catch { /* keep placeholder */ }
  return {
    commit: dirty ? `${commit}-dirty` : commit,
    builtAt: new Date().toISOString(),
    version,
  }
}

const BUILD_INFO = readBuildInfo()

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

  /* Expose the build-time metadata to the bundle. JSON.stringify so the
     value is inlined as a literal object — no runtime cost, no extra
     module. Frontend reads it via the global `__BUILD_INFO__` (typed
     in `src/app/types/build.d.ts`). */
  define: {
    __BUILD_INFO__: JSON.stringify(BUILD_INFO),
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
