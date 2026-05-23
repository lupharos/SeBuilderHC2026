/* Build-time metadata baked into the bundle by vite.config.ts.
   See `readBuildInfo()` there for how each field is populated.
   Globally available — no import needed. */
declare const __BUILD_INFO__: {
  /** UI product name shown in chrome ("HC Studio"). */
  productName: string;
  /** Customer-facing release label ("v2025.05") — bump on each release. */
  productVersion: string;
  /** Short git SHA at build time. Suffixed with `-dirty` when the
      working tree had uncommitted changes during the build. */
  commit: string;
  /** UTC ISO timestamp of when the build was produced. */
  builtAt: string;
  /** package.json `version` field (semver). */
  version: string;
};
