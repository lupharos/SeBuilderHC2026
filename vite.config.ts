import { defineConfig } from 'vite'
import path from 'path'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/* Build-time metadata baked into the bundle.
   ───────────────────────────────────────────────────────────────────
   Single source of truth: versioncheck.json at the repo root. Every
   surface (login pill, nav-rail chip, Profile panel, in-app upgrade
   banner) reads from it. The flow is:
     1. At BUILD time, vite reads versioncheck.json and inlines the
        version + release date into __BUILD_INFO__ — that snapshot
        ships with the bundle, so the UI never goes blank when the
        host is offline.
     2. At BUILD time, vite ALSO emits versioncheck.json as a static
        asset to dist/, so nginx serves it at /versioncheck.json on
        the deploy host (see the versionCheckPlugin below).
     3. At RUNTIME, the Profile panel fetches /versioncheck.json and
        compares it to the baked-in __BUILD_INFO__.productVersion.
        Mismatch → "Upgrade available, please click Upgrade" banner,
        wired to the same self-upgrade endpoint as the manual button.
   Bumping a release is now one edit to versioncheck.json + a deploy.
   The deploy.sh rebuild copies the new JSON into dist/ automatically. */
const VERSIONCHECK_PATH = path.resolve(__dirname, 'versioncheck.json')

type VersionCheck = {
  productName?: string
  version?: string
  releasedAt?: string
  notes?: string
}

function readVersionCheck(): VersionCheck {
  try {
    const raw = readFileSync(VERSIONCHECK_PATH, 'utf8')
    return JSON.parse(raw) as VersionCheck
  } catch {
    return {}
  }
}

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
  const vc = readVersionCheck()
  const productName    = vc.productName    || 'HC Studio'
  const rawProductVersion = vc.version     || '0.0.0'
  /* Display label always carries a leading "v" — versioncheck.json
     stores the bare number so an automated bumper can edit it without
     worrying about the prefix. */
  const productVersion = rawProductVersion.startsWith('v') ? rawProductVersion : `v${rawProductVersion}`
  const releasedAt     = vc.releasedAt     || ''
  const releaseNotes   = vc.notes          || ''
  return {
    productName,
    productVersion,
    releasedAt,
    releaseNotes,
    commit: dirty ? `${commit}-dirty` : commit,
    builtAt: new Date().toISOString(),
    version,
  }
}

/* Versioncheck plugin — copies the JSON into dist/ at build time AND
   serves it from the dev middleware so /versioncheck.json works in
   both `vite dev` and `vite build`. Without this the frontend would
   only see the build-time snapshot and could never detect a newer
   version on the host. */
function versionCheckPlugin() {
  return {
    name: 'versioncheck-emitter',
    /* Build: emit dist/versioncheck.json from the repo-root source so
       nginx can serve it at the well-known URL after deploy. */
    generateBundle() {
      let source: string
      try {
        source = readFileSync(VERSIONCHECK_PATH, 'utf8')
      } catch {
        /* No file on disk — fall back to a synthesized minimal JSON
           so the frontend's fetch doesn't 404. */
        const info = readBuildInfo()
        source = JSON.stringify({
          productName: info.productName,
          version: info.productVersion.replace(/^v/, ''),
          releasedAt: '',
          notes: '',
        }, null, 2)
      }
      // @ts-expect-error rollup plugin context (added by vite)
      this.emitFile({ type: 'asset', fileName: 'versioncheck.json', source })
    },
    /* Dev: serve the file directly so the Profile panel's fetch works
       against `npm run dev` as well. */
    configureServer(server: any) {
      server.middlewares.use('/versioncheck.json', (_req: any, res: any) => {
        try {
          const source = readFileSync(VERSIONCHECK_PATH, 'utf8')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(source)
        } catch {
          res.statusCode = 404
          res.end()
        }
      })
    },
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
    versionCheckPlugin(),
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
