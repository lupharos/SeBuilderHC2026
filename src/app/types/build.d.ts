/* Build-time metadata baked into the bundle by vite.config.ts.
   See `readBuildInfo()` there for how each field is populated.
   Globally available — no import needed. */
declare const __BUILD_INFO__: {
  /** UI product name shown in chrome ("HC Studio"). Sourced from
   *  versioncheck.json at the repo root. */
  productName: string;
  /** Customer-facing release label ("v2025.05.01") — sourced from
   *  versioncheck.json. Always has a leading "v" for display. */
  productVersion: string;
  /** Release date as written in versioncheck.json ("2026-05-24"). */
  releasedAt: string;
  /** Release notes blob from versioncheck.json. May be multi-line. */
  releaseNotes: string;
  /** Short git SHA at build time. Suffixed with `-dirty` when the
      working tree had uncommitted changes during the build. */
  commit: string;
  /** UTC ISO timestamp of when the build was produced. */
  builtAt: string;
  /** package.json `version` field (semver). */
  version: string;
};
