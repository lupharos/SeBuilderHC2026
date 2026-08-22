/* DLP report SQL registry — partition-aware queries against Forcepoint
   Data Security Manager's incident database.

   Each report below has:
     - `title`           — human label
     - `description`     — one-line rationale shown in the wizard / report
     - `defaultWindowDays` — used when caller omits windowDays
     - `fixedWindow`     — optional; when true the report uses a hard-coded
                            window (the time selector is hidden in the UI)
     - `sql(opts)`       — returns the final SQL string; `opts.days` is
                            interpolated into the DATEADD predicate

   The DSM stores incidents in monthly partitions named
   `PA_EVENTS_<partition_index>`. The currently-writeable partition is
   identified in `PA_EVENT_PARTITION_CATALOG` where STATUS='ONLINE_ACTIVE'.
   Every query below follows the same two-step pattern:
     1. Look up the active partition index
     2. Build dynamic SQL against `PA_EVENTS_<index>` and EXEC it

   `opts.days` is sanitised to a positive integer before being injected
   into the template so the caller cannot smuggle SQL through it.
*/

function sanitiseDays(input, fallback) {
  const n = Math.floor(Number(input));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 3650);  // cap at ~10 years; absurd values become 3650
}

/* Optional TOP N clause. Returns `TOP <n> ` (note trailing space) or ''
   so it slots cleanly after SELECT in the dynamic SQL template. Templates
   that don't make sense with TOP (e.g. the anomaly HAVING-filter) simply
   ignore the opt. */
function topClause(input) {
  if (input === undefined || input === null) return '';
  const n = Math.floor(Number(input));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `TOP ${Math.min(n, 10000)} `;
}

/**
 * @typedef {Object} DlpQuery
 * @property {string} title
 * @property {string} description
 * @property {number} defaultWindowDays
 * @property {boolean} [fixedWindow]
 * @property {(opts: { days: number }) => string} sql
 */

/** @type {Record<string, DlpQuery>} */
export const DLP_QUERIES = {
  /* 1) Top Users Triggering DLP Policy Violations
        — most-active offenders, ordered by total event count. */
  dlp_top_violators: {
    title: 'Top Users Triggering DLP Policy Violations',
    description: 'Most active users by total DLP violation count.',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    usr.LOGIN_NAME AS [User],
    usr.EMAIL AS [Email],
    COUNT(*) AS [Total Violations]
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
GROUP BY usr.LOGIN_NAME, usr.EMAIL
ORDER BY [Total Violations] DESC
'
EXEC(@SQL)`,
  },

  /* 2) Most Frequently Violated DLP Policies — top policy categories
        by raw event count. (Was previously also exposed as
        dlp_classification — that duplicate has been removed.) */
  dlp_top_policies: {
    title: 'Most Frequently Violated DLP Policies',
    description: 'Policy categories ranked by violation count.',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    ev.POLICY_CATEGORIES,
    COUNT(*) AS VIOLATION_COUNT
FROM PA_EVENTS_' + @partitionName + ' ev
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
GROUP BY ev.POLICY_CATEGORIES
ORDER BY VIOLATION_COUNT DESC
'
EXEC(@SQL)`,
  },

  /* 3) Top Sensitive Data Categories Detected — same axis as #2 but
        ranked by exfiltrated data volume rather than count. (Replaces
        the previously separate dlp_classification_exposure report —
        now that the window is configurable, the 100-day variant is
        the same query.) */
  dlp_sensitive_data: {
    title: 'Top Sensitive Data Categories Detected',
    description: 'Sensitive data categories (PCI / PII / IP) by detection count and total exfiltrated size.',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    ev.POLICY_CATEGORIES,
    COUNT(*) AS DETECTION_COUNT,
    SUM(ev.TOTAL_SIZE) AS TOTAL_EXFILTRATED_SIZE
FROM PA_EVENTS_' + @partitionName + ' ev
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
GROUP BY ev.POLICY_CATEGORIES
ORDER BY TOTAL_EXFILTRATED_SIZE DESC
'
EXEC(@SQL)`,
  },

  /* 4) Users with Repeated Exfiltration Attempts — HAVING ≥5 to filter
        one-off events; surfaces sustained patterns to the same destination. */
  dlp_repeated_exfil: {
    title: 'Users with Repeated Exfiltration Attempts',
    description: 'User × destination pairs with five or more attempts in the selected window.',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    usr.LOGIN_NAME,
    ev.DESTINATIONS,
    COUNT(*) AS ATTEMPT_COUNT
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
GROUP BY usr.LOGIN_NAME, ev.DESTINATIONS
HAVING COUNT(*) >= 5
ORDER BY ATTEMPT_COUNT DESC
'
EXEC(@SQL)`,
  },

  /* 5) Top Cloud Applications Used for Upload Attempts — SaaS storage
        destinations by upload count. (dlp_cloud_ai removed; the two
        clean queries below — this one for SaaS storage, and
        dlp_ai_usage for AI tools per user — replace it.) */
  dlp_cloud_uploads: {
    title: 'Top Cloud Applications Used for Upload Attempts',
    description: 'Upload attempts to common SaaS storage providers (Drive, Dropbox, Box, SharePoint, iCloud).',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    ev.DESTINATIONS,
    COUNT(*) AS UPLOAD_ATTEMPTS
FROM PA_EVENTS_' + @partitionName + ' ev
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
  AND (
        ev.DESTINATIONS LIKE ''%drive%'' OR
        ev.DESTINATIONS LIKE ''%dropbox%'' OR
        ev.DESTINATIONS LIKE ''%box.com%'' OR
        ev.DESTINATIONS LIKE ''%sharepoint%'' OR
        ev.DESTINATIONS LIKE ''%icloud%''
      )
GROUP BY ev.DESTINATIONS
ORDER BY UPLOAD_ATTEMPTS DESC
'
EXEC(@SQL)`,
  },

  /* 6) Top Critical Severity Users — SENSITIVITY_ID = 1 is High in DSM. */
  dlp_critical_users: {
    title: 'Top Critical Severity Users',
    description: 'Users with the highest count of HIGH-sensitivity events (SENSITIVITY_ID = 1).',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    usr.LOGIN_NAME,
    COUNT(*) AS HIGH_SEVERITY_EVENTS
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
  AND ev.SENSITIVITY_ID = 1
GROUP BY usr.LOGIN_NAME
ORDER BY HIGH_SEVERITY_EVENTS DESC
'
EXEC(@SQL)`,
  },

  /* ═══════════════════════════════════════════════════════════════════
     ADVANCED ANALYTICS — broader baseline windows
     ─────────────────────────────────────────────────────────────────
     The reports below feed downstream risk-scoring and anomaly detection
     workflows. They default to a 100-day window but the user can shorten
     it via the per-row window selector.
  ═══════════════════════════════════════════════════════════════════ */

  /* 7) User Risk + Activity Profile — per-user behaviour baseline:
        volume, fan-out, average size, severity mix, blocked share. */
  dlp_user_risk_profile: {
    title: 'User Risk + Activity Profile',
    description: 'Per-user baseline — total events, unique destinations, average size, high-severity count, blocked count.',
    defaultWindowDays: 100,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    usr.LOGIN_NAME,
    COUNT(*) AS TOTAL_EVENTS,
    COUNT(DISTINCT ev.DESTINATIONS) AS UNIQUE_DESTINATIONS,
    AVG(ev.TOTAL_SIZE) AS AVG_SIZE,
    SUM(CASE WHEN ev.SENSITIVITY_ID=1 THEN 1 ELSE 0 END) AS HIGH_SEVERITY,
    SUM(CASE WHEN ev.ACTION_TYPE=2 THEN 1 ELSE 0 END) AS BLOCKED_EVENTS
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 100)},GETDATE())
GROUP BY usr.LOGIN_NAME
ORDER BY TOTAL_EVENTS DESC
'
EXEC(@SQL)`,
  },

  /* 8) User Anomaly Detection — fixed-window comparison: surfaces users
         whose last 7 days count exceeds last-100 / 14. Hard-coded windows
         are intrinsic to the analysis, so this report does NOT expose a
         window selector in the UI. */
  dlp_user_anomaly: {
    title: 'User Anomaly Detection (7 vs 100-day spike)',
    description: 'Users whose 7-day event count is anomalously high relative to their 100-day baseline — insider threat / compromised account candidates.',
    defaultWindowDays: 7,
    fixedWindow: true,
    sql: () => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT
    usr.LOGIN_NAME,
    SUM(CASE WHEN ev.INSERT_DATE >= DATEADD(DAY,-7,GETDATE()) THEN 1 ELSE 0 END) AS LAST_7_DAYS,
    SUM(CASE WHEN ev.INSERT_DATE >= DATEADD(DAY,-100,GETDATE()) THEN 1 ELSE 0 END) AS LAST_100_DAYS
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
GROUP BY usr.LOGIN_NAME
HAVING
    SUM(CASE WHEN ev.INSERT_DATE >= DATEADD(DAY,-7,GETDATE()) THEN 1 ELSE 0 END) >
    SUM(CASE WHEN ev.INSERT_DATE >= DATEADD(DAY,-100,GETDATE()) THEN 1 ELSE 0 END) / 14
'
EXEC(@SQL)`,
  },

  /* 9) Domain Risk & Behavior Cluster — per-destination profile with
         severity and block ratios. */
  dlp_domain_cluster: {
    title: 'Domain Risk & Behavior Cluster',
    description: 'Per-destination profile — total events, high-severity event count, blocked count. Surfaces high-risk domains.',
    defaultWindowDays: 100,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    ev.DESTINATIONS,
    COUNT(*) AS TOTAL_EVENTS,
    SUM(CASE WHEN ev.SENSITIVITY_ID=1 THEN 1 ELSE 0 END) AS HIGH_EVENTS,
    SUM(CASE WHEN ev.ACTION_TYPE=2 THEN 1 ELSE 0 END) AS BLOCKED_EVENTS
FROM PA_EVENTS_' + @partitionName + ' ev
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 100)},GETDATE())
GROUP BY ev.DESTINATIONS
ORDER BY HIGH_EVENTS DESC
'
EXEC(@SQL)`,
  },

  /* 10) AI / GenAI Usage + User Mapping — per-user GenAI tool usage
          with block ratio. Pure AI-tool filter (cloud-storage destinations
          live in dlp_cloud_uploads). */
  dlp_ai_usage: {
    title: 'AI / GenAI Usage + User Mapping',
    description: 'Per-user usage of GenAI tools (ChatGPT, Gemini, Claude, Copilot, OpenAI) with block ratio.',
    defaultWindowDays: 100,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    usr.LOGIN_NAME,
    COUNT(*) AS TOTAL_AI_EVENTS,
    SUM(CASE WHEN ev.ACTION_TYPE=2 THEN 1 ELSE 0 END) AS BLOCKED_EVENTS
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 100)},GETDATE())
  AND (
        ev.DESTINATIONS LIKE ''%chatgpt%'' OR
        ev.DESTINATIONS LIKE ''%gemini%'' OR
        ev.DESTINATIONS LIKE ''%claude%'' OR
        ev.DESTINATIONS LIKE ''%copilot%'' OR
        ev.DESTINATIONS LIKE ''%openai%''
      )
GROUP BY usr.LOGIN_NAME
ORDER BY TOTAL_AI_EVENTS DESC
'
EXEC(@SQL)`,
  },

  /* 11a) GenAI & Cloud Destinations — Leak Incident Counts
          Per-destination incident count covering both GenAI tools and SaaS
          cloud storage. Sibling to dlp_ai_usage (per-user) and
          dlp_cloud_uploads (SaaS-only) — this one unifies the two axes
          and rolls up by destination instead of user. */
  dlp_genai_leaks: {
    title: 'GenAI & Cloud Destinations — Leak Incident Counts',
    description: 'Incident counts per GenAI service or cloud destination (ChatGPT, Gemini, Claude, Copilot, OpenAI, Drive, Dropbox).',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    ev.DESTINATIONS,
    COUNT(*) AS INCIDENT_COUNT
FROM PA_EVENTS_' + @partitionName + ' ev
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 30)},GETDATE())
  AND (
        ev.DESTINATIONS LIKE ''%chatgpt%'' OR
        ev.DESTINATIONS LIKE ''%gemini%'' OR
        ev.DESTINATIONS LIKE ''%claude%'' OR
        ev.DESTINATIONS LIKE ''%copilot%'' OR
        ev.DESTINATIONS LIKE ''%openai%'' OR
        ev.DESTINATIONS LIKE ''%drive%'' OR
        ev.DESTINATIONS LIKE ''%dropbox%''
      )
GROUP BY ev.DESTINATIONS
ORDER BY INCIDENT_COUNT DESC
'
EXEC(@SQL)`,
  },

  /* 11) False Positive Signal Engine — user × destination pairs that
          look mechanically repetitive: ≥10 events with mostly low
          TOTAL_MATCHES counts. Candidates for policy tuning. */
  dlp_false_positive: {
    title: 'False Positive Signal Engine',
    description: 'User × destination pairs with ≥10 events and a high share of low-match (TOTAL_MATCHES ≤ 2) events — likely policy tuning candidates.',
    defaultWindowDays: 100,
    sql: ({ days, topN }) => `
DECLARE @partitionName NVARCHAR(30)
SELECT @partitionName = PARTITION_INDEX
FROM PA_EVENT_PARTITION_CATALOG
WHERE STATUS='ONLINE_ACTIVE'

DECLARE @SQL NVARCHAR(MAX) = '
SELECT ${topClause(topN)}
    usr.LOGIN_NAME,
    ev.DESTINATIONS,
    COUNT(*) AS EVENTS,
    AVG(ev.TOTAL_SIZE) AS AVG_SIZE,
    SUM(CASE WHEN ev.TOTAL_MATCHES<=2 THEN 1 ELSE 0 END) AS LOW_MATCH_EVENTS,
    SUM(CASE WHEN ev.ACTION_TYPE=2 THEN 1 ELSE 0 END) AS BLOCKED_EVENTS
FROM PA_EVENTS_' + @partitionName + ' ev
JOIN PA_MNG_USERS usr ON ev.SOURCE_ID = usr.ID
WHERE ev.INSERT_DATE >= DATEADD(DAY,-${sanitiseDays(days, 100)},GETDATE())
GROUP BY usr.LOGIN_NAME, ev.DESTINATIONS
HAVING COUNT(*) >= 10
ORDER BY EVENTS DESC
'
EXEC(@SQL)`,
  },
};

/* ═════════════════════════════════════════════════════════════════
   FORCEPOINT WEB SECURITY — USAGE ANALYSIS QUERIES
   Database: wslogdb70 (Web Security log database)
   ═════════════════════════════════════════════════════════════════
   Each report below targets the Forcepoint WSE log database with
   parameterized day window and TOP N support. All queries use NOLOCK
   hints to avoid locking live LogServer writes. */

/** @type {Record<string, DlpQuery>} */
export const WEB_QUERIES = {
  /* 1) Top Risk Classes (Value Classes) — overall risk profile */
  web_top_value_classes: {
    title: 'Top Risk Classes (Value Classes)',
    description: 'Risk classes (Security Risk, Productivity Loss, etc.) ranked by total hits.',
    defaultWindowDays: 90,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    VC.Name as RiskClass,
    SUM(CAST(d.hits AS NUMERIC)) as Hits
FROM
    SUMMARY_NOUSER d (NOLOCK),
    VALUE_CLASS VC (NOLOCK),
    VALUE_CLASS_CATEGORY_MAP vcmap (NOLOCK)
WHERE
    VC.value_id = vcmap.value_id
    AND vcmap.category_id = d.category
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 90)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    vcmap.value_id, VC.NAME
HAVING
    SUM(CAST(d.hits AS NUMERIC)) > 0
ORDER BY
    SUM(CAST(d.hits AS NUMERIC)) DESC`,
  },

  /* 2) Value Class → Category Breakdown — drill-down by risk class */
  web_value_class_breakdown: {
    title: 'Risk Class → Category Breakdown',
    description: 'Categories within a selected risk class, ranked by hit count.',
    defaultWindowDays: 90,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    VC.NAME as RiskClass,
    RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME) as Category,
    SUM(CAST(d.hits AS NUMERIC)) as Hits
FROM
    SUMMARY_NOUSER d (NOLOCK),
    VALUE_CLASS VC (NOLOCK),
    VALUE_CLASS_CATEGORY_MAP vcmap (NOLOCK),
    CATEGORY C (NOLOCK)
WHERE
    vcmap.value_id = 4
    AND VC.value_id = vcmap.value_id
    AND vcmap.category_id = d.category
    AND C.CATEGORY = d.category
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 90)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    vcmap.value_id, VC.NAME, d.category, RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME)
HAVING
    SUM(CAST(d.hits AS NUMERIC)) > 0
ORDER BY
    SUM(CAST(d.hits AS NUMERIC)) DESC`,
  },

  /* 3) Disposition Analysis — Allow/Block/Quota breakdown for a risk class */
  /* 4) Top Categories Overall — general usage profile */
  web_top_categories: {
    title: 'Top Categories Overall',
    description: 'All categories ranked by hit count (no risk-class filter).',
    defaultWindowDays: 90,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME) as Category,
    SUM(CAST(d.hits AS NUMERIC)) as Hits
FROM
    SUMMARY_NOUSER d (NOLOCK),
    CATEGORY C (NOLOCK)
WHERE
    C.CATEGORY = d.category
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 90)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    d.category, RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME)
HAVING
    SUM(CAST(d.hits AS NUMERIC)) > 0
ORDER BY
    SUM(CAST(d.hits AS NUMERIC)) DESC`,
  },

  /* 5) User → Category → Time Analysis — per-user browse-time profile */
  web_user_time_analysis: {
    title: 'User Time Usage by Category',
    description: 'Browse time (in minutes) each user spent in each category.',
    defaultWindowDays: 90,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    CASE
        WHEN UN.USER_FULL_NAME = UN.USER_LOGIN_NAME THEN LTRIM(UN.USER_FULL_NAME)
        ELSE LTRIM(UN.USER_FULL_NAME + ' [' + UN.USER_LOGIN_NAME + ']')
    END as [User],
    RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME) as Category,
    ROUND(SUM(d.browse_time) / 60.0, 0) as Minutes
FROM
    SUMMARY d (NOLOCK),
    USER_NAMES UN (NOLOCK),
    CATEGORY C (NOLOCK)
WHERE
    UN.USER_ID = d.user_id
    AND d.category = C.CATEGORY
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 90)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    d.user_id,
    CASE
        WHEN UN.USER_FULL_NAME = UN.USER_LOGIN_NAME THEN LTRIM(UN.USER_FULL_NAME)
        ELSE LTRIM(UN.USER_FULL_NAME + ' [' + UN.USER_LOGIN_NAME + ']')
    END,
    d.category,
    RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME)
HAVING
    SUM(d.browse_time) > 0
ORDER BY
    d.user_id ASC, SUM(d.browse_time) DESC`,
  },

  /* 6) Top Users Overall — general activity profile */
  web_top_users: {
    title: 'Top Users by Activity',
    description: 'Users ranked by total hit count across all categories.',
    defaultWindowDays: 90,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    CASE
        WHEN UN.USER_FULL_NAME = UN.USER_LOGIN_NAME THEN LTRIM(UN.USER_FULL_NAME)
        ELSE LTRIM(UN.USER_FULL_NAME + ' [' + UN.USER_LOGIN_NAME + ']')
    END as [User],
    SUM(CAST(d.hits AS NUMERIC)) as Hits
FROM
    SUMMARY d (NOLOCK),
    USER_NAMES UN (NOLOCK)
WHERE
    UN.USER_ID = d.user_id
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 90)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    d.user_id,
    CASE
        WHEN UN.USER_FULL_NAME = UN.USER_LOGIN_NAME THEN LTRIM(UN.USER_FULL_NAME)
        ELSE LTRIM(UN.USER_FULL_NAME + ' [' + UN.USER_LOGIN_NAME + ']')
    END
HAVING
    SUM(CAST(d.hits AS NUMERIC)) > 0
ORDER BY
    SUM(CAST(d.hits AS NUMERIC)) DESC`,
  },

  /* 7) Shadow AI Tools Detection — top AI sites visited */
  web_ai_top_urls: {
    title: '🤖 Shadow AI Tools Detection',
    description: 'Top Generative AI sites (ChatGPT, Claude, Gemini, etc.) ranked by hit count.',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    U.name as [AI Site],
    SUM(CAST(d.hits AS NUMERIC)) as Hits
FROM
    SUMMARY_URL d (NOLOCK),
    CATEGORY C (NOLOCK),
    wse_urls U (NOLOCK)
WHERE
    d.category = 229
    AND C.CATEGORY = d.category
    AND U.wse_url_id = d.url_id
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 30)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    U.name
HAVING
    SUM(CAST(d.hits AS NUMERIC)) > 0
ORDER BY
    SUM(CAST(d.hits AS NUMERIC)) DESC`,
  },

  /* 8) Shadow AI Users Detection — who is using AI tools */
  web_ai_top_users: {
    title: '🤖 Top AI Tool Users',
    description: 'Users with highest Generative AI tool usage (data-leakage risk assessment).',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME) as Category,
    CASE
        WHEN UN.USER_FULL_NAME = UN.USER_LOGIN_NAME THEN LTRIM(UN.USER_FULL_NAME)
        ELSE LTRIM(UN.USER_FULL_NAME + ' [' + UN.USER_LOGIN_NAME + ']')
    END as [User],
    SUM(CAST(d.hits AS NUMERIC)) as Hits
FROM
    SUMMARY d (NOLOCK),
    CATEGORY C (NOLOCK),
    USER_NAMES UN (NOLOCK)
WHERE
    d.category = 229
    AND C.CATEGORY = d.category
    AND UN.USER_ID = d.user_id
    AND d.date_time >= DATEADD(day, -${sanitiseDays(days, 30)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND d.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
GROUP BY
    d.category, RTRIM(C.NAME) + ' ' + RTRIM(C.CHILD_NAME),
    d.user_id,
    CASE
        WHEN UN.USER_FULL_NAME = UN.USER_LOGIN_NAME THEN LTRIM(UN.USER_FULL_NAME)
        ELSE LTRIM(UN.USER_FULL_NAME + ' [' + UN.USER_LOGIN_NAME + ']')
    END
HAVING
    SUM(CAST(d.hits AS NUMERIC)) > 0
ORDER BY
    SUM(CAST(d.hits AS NUMERIC)) DESC`,
  },

  /* ADVANCED: Bot Networks detail — user/IP/URL investigation */
  web_bot_networks: {
    title: 'Bot Networks Activity (Detail)',
    description: 'Bot network visits with user, IP, timestamp, and full URL (row-level logs).',
    defaultWindowDays: 60,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    U.user_login_name as [User],
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/16777216) & 255) + '.' +
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/65536) & 255) + '.' +
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/256) & 255) + '.' +
    CONVERT(VARCHAR(15), WLOG.source_ip_int & 255) as IP_Address,
    WLOG.date_time as [Date],
    URL.name as [Domain],
    WLOG.full_url as [Full URL],
    C.name as [Parent Category],
    C.child_name as [Child Category]
FROM
    log_details WLOG (NOLOCK)
    JOIN users U (NOLOCK) ON WLOG.user_id = U.user_id
    JOIN wse_urls URL (NOLOCK) ON WLOG.url_id = URL.wse_url_id
    JOIN category C (NOLOCK) ON WLOG.category = C.category
WHERE
    C.child_name = 'Bot Networks'
    AND WLOG.date_time >= DATEADD(day, -${sanitiseDays(days, 60)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND WLOG.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
ORDER BY
    U.user_login_name, WLOG.date_time, WLOG.full_url`,
  },

  /* ADVANCED: Malicious Web Sites detail */
  web_malicious_sites: {
    title: 'Malicious Web Sites (Detail)',
    description: 'Malicious site access with user, IP, timestamp, and full URL.',
    defaultWindowDays: 60,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    U.user_login_name as [User],
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/16777216) & 255) + '.' +
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/65536) & 255) + '.' +
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/256) & 255) + '.' +
    CONVERT(VARCHAR(15), WLOG.source_ip_int & 255) as IP_Address,
    WLOG.date_time as [Date],
    URL.name as [Domain],
    WLOG.full_url as [Full URL],
    C.name as [Parent Category],
    C.child_name as [Child Category]
FROM
    log_details WLOG (NOLOCK)
    JOIN users U (NOLOCK) ON WLOG.user_id = U.user_id
    JOIN wse_urls URL (NOLOCK) ON WLOG.url_id = URL.wse_url_id
    JOIN category C (NOLOCK) ON WLOG.category = C.category
WHERE
    C.child_name = 'Malicious Web Sites'
    AND WLOG.date_time >= DATEADD(day, -${sanitiseDays(days, 60)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND WLOG.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
ORDER BY
    U.user_login_name, WLOG.date_time, WLOG.full_url`,
  },

  /* ADVANCED: Security category detail */
  web_security_category: {
    title: 'Security Category Access (Detail)',
    description: 'All Security category access with user, IP, timestamp, and URL.',
    defaultWindowDays: 60,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    U.user_login_name as [User],
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/16777216) & 255) + '.' +
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/65536) & 255) + '.' +
    CONVERT(VARCHAR(15), (WLOG.source_ip_int/256) & 255) + '.' +
    CONVERT(VARCHAR(15), WLOG.source_ip_int & 255) as IP_Address,
    WLOG.date_time as [Date],
    URL.name as [Domain],
    WLOG.full_url as [Full URL],
    C.name as [Parent Category],
    C.child_name as [Child Category]
FROM
    log_details WLOG (NOLOCK)
    JOIN users U (NOLOCK) ON WLOG.user_id = U.user_id
    JOIN wse_urls URL (NOLOCK) ON WLOG.url_id = URL.wse_url_id
    JOIN category C (NOLOCK) ON WLOG.category = C.category
WHERE
    C.name = 'Security'
    AND WLOG.date_time >= DATEADD(day, -${sanitiseDays(days, 60)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND WLOG.date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
ORDER BY
    U.user_login_name, WLOG.date_time, WLOG.full_url`,
  },

  /* ADVANCED: AMT (Advanced Malware Threats) logs */
  web_amt_logs: {
    title: 'Advanced Malware Threat Logs',
    description: 'Recent AMT detections with disposition, category, and threat details.',
    defaultWindowDays: 30,
    sql: ({ days, topN }) => `
SELECT ${topClause(topN)}
    date_time,
    disposition_id,
    category_id,
    category_reason_id,
    static_category_id,
    static_category_reason_id,
    port,
    full_url
FROM
    amt_log_details (NOLOCK)
WHERE
    date_time >= DATEADD(day, -${sanitiseDays(days, 30)}, CONVERT(smalldatetime, CONVERT(date, GETDATE())))
    AND date_time < CONVERT(smalldatetime, CONVERT(date, GETDATE()))
ORDER BY
    date_time DESC`,
  },
};
