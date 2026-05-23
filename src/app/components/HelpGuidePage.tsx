import { useEffect, useState, useRef } from 'react';
import {
  BookOpen, Compass, Layers, Workflow, Plug, FileText,
  ListChecks, ShieldAlert, Wrench, Zap, AlertOctagon, MessageCircle,
  Mail, ExternalLink, ChevronRight,
} from 'lucide-react';

/* Help Guide — in-app version of AdminGuide.md.
   ─────────────────────────────────────────────────────────────────
   Renders the same content as the markdown file at the repo root
   but as styled JSX so it can be opened from the nav rail without
   leaving the wizard. The two are intentionally kept in sync — if
   you change one, change the other.

   Layout:
     ┌──────────────┬────────────────────────────────────────┐
     │  Sticky TOC  │  Scrolling content                     │
     │  (sections)  │  (intro + 12 numbered sections)        │
     │              │                                        │
     └──────────────┴────────────────────────────────────────┘

   The TOC entries are anchor links — clicking scrolls the right pane
   to the matching <section id="…">. A scroll-spy effect highlights
   the active section as the operator scrolls. */

interface TocItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TOC: TocItem[] = [
  { id: 'overview',         label: '1. What this tool is',          icon: <BookOpen size={13} /> },
  { id: 'navigation',       label: '2. Navigation rail',            icon: <Compass size={13} /> },
  { id: 'wizard',           label: '3. The 18-step Wizard',         icon: <Layers size={13} /> },
  { id: 'connector',        label: '4. Customer Connector',         icon: <Plug size={13} /> },
  { id: 'sf-import',        label: '5. Salesforce JSON import',     icon: <FileText size={13} /> },
  { id: 'reports',          label: '6. Reports',                    icon: <ListChecks size={13} /> },
  { id: 'workflows',        label: '7. Common workflows',           icon: <Workflow size={13} /> },
  { id: 'troubleshoot',     label: '8. Troubleshooting',            icon: <ShieldAlert size={13} /> },
  { id: 'quickref',         label: '9. Quick reference',            icon: <Zap size={13} /> },
  { id: 'updates',          label: '10. Update workflow',           icon: <Wrench size={13} /> },
  { id: 'nevers',           label: '11. Things to NEVER do',        icon: <AlertOctagon size={13} /> },
  { id: 'help',             label: '12. Where to ask for help',     icon: <MessageCircle size={13} /> },
];

export function HelpGuidePage() {
  /* Scroll-spy — observes each section heading; whichever is closest
     to the top of the viewport wins. IntersectionObserver gives near-
     zero overhead vs onScroll listeners. */
  const [activeId, setActiveId] = useState<string>(TOC[0].id);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        /* Pick the topmost intersecting section. We want the section
           the user is actively reading, not just any section currently
           on-screen, so we sort by bounding rect top. */
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute('data-section-id');
          if (id) setActiveId(id);
        }
      },
      { root, rootMargin: '-20% 0px -55% 0px', threshold: 0 },
    );
    TOC.forEach((t) => {
      const el = root.querySelector(`[data-section-id="${t.id}"]`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const root = scrollerRef.current;
    const target = root?.querySelector(`[data-section-id="${id}"]`) as HTMLElement | null;
    if (!root || !target) return;
    root.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ background: '#F4F7FB' }}>
      {/* Page header */}
      <div className="px-8 py-5" style={{ borderBottom: '1px solid #E2E8F0', background: '#fff' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#1D4ED8,#7C3AED)' }}>
            <BookOpen size={18} style={{ color: '#fff' }} />
          </div>
          <div className="flex-1">
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F2952' }}>
              Help Guide · Forcepoint HC Wizard
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Every menu, every step, every workflow — for new SEs and old hands
              who just need a reminder.
            </div>
          </div>
        </div>

      </div>

      {/* Two-column body: sticky TOC on left, scrolling content on right */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* TOC */}
        <nav className="flex-shrink-0 py-5 px-3 overflow-y-auto"
          style={{ width: 280, background: '#fff', borderRight: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', color: '#94A3B8', textTransform: 'uppercase', padding: '0 8px 8px' }}>
            Contents
          </div>
          {TOC.map((t) => {
            const active = activeId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => scrollTo(t.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all mb-0.5"
                style={{
                  background: active ? 'rgba(29,78,216,0.08)' : 'transparent',
                  color: active ? '#1D4ED8' : '#475569',
                  fontSize: '12px',
                  fontWeight: active ? 700 : 500,
                  border: active ? '1px solid rgba(29,78,216,0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                }}>
                <span style={{ color: active ? '#1D4ED8' : '#94A3B8' }}>{t.icon}</span>
                <span className="flex-1">{t.label}</span>
                {active && <ChevronRight size={12} />}
              </button>
            );
          })}

          {/* Footer card on the TOC — links + reminders */}
          <div className="mt-4 px-3 py-3 rounded-lg"
            style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', marginBottom: 6 }}>
              QUICK LINKS
            </div>
            <a href="https://github.com/lupharos/SeBuilderHC2026"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 mb-1"
              style={{ fontSize: '11px', color: '#1D4ED8', textDecoration: 'none' }}>
              <ExternalLink size={10} /> Source repository
            </a>
            <a href="mailto:kartikarslan@forcepoint.com?subject=HC%20Wizard%20feedback"
              className="flex items-center gap-1.5"
              style={{ fontSize: '11px', color: '#1D4ED8', textDecoration: 'none' }}>
              <Mail size={10} /> Send feedback
            </a>
          </div>
        </nav>

        {/* Content pane */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
          <div className="px-10 py-8">

            {/* Intro card */}
            <div className="mb-8 p-6 rounded-xl"
              style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.04), rgba(124,58,237,0.04))', border: '1px solid rgba(29,78,216,0.15)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.04em', marginBottom: 8, textTransform: 'uppercase' }}>
                Forcepoint Health Check Wizard
              </div>
              <p style={{ fontSize: '14px', color: '#0F2952', lineHeight: 1.7, margin: 0 }}>
                This tool takes a customer's Forcepoint deployment data — Salesforce
                account info, license inventory, DLP server diagnostic dumps, log
                files, SQL telemetry, REST API posture — and turns it into two
                deliverables: a <strong>10-page Executive Risk Briefing</strong> for the CISO /
                CIO and a <strong>40-60 page Health Check &amp; Maturity Assessment</strong> for the
                security / SOC / infra teams. Single wizard session, both reports.
              </p>
              <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}>
                <strong>90% of engagements run through the same loop:</strong> SF import (Step 1)
                → connector setup (Step 3) → drop the DLPServerInfo bundle → bulk Run reports
                → Fetch posture → 8 quick checklist screens → click Generate in Step 18. This
                guide exists for the other 10%.
              </p>
            </div>

            {/* ── 1. WHAT THIS TOOL IS ─────────────────────────────── */}
            <Section id="overview" title="1. What this tool is">
              <H2>Where things run</H2>
              <p>
                The wizard is a single-page React app served by nginx on an Ubuntu deploy
                host. A Node companion service (<Code>127.0.0.1:3001</Code>) handles SQL Server
                connections, DLP REST API auth, and the Customer Connector job queue. nginx
                proxies <Code>/api/*</Code> to the companion.
              </p>
              <pre style={{ fontSize: '11px', background: '#0F2952', color: '#A5B4FC', padding: '14px 18px', borderRadius: 8, lineHeight: 1.55, overflow: 'auto' }}>
{`┌─────────────────────────────────────────────────────────────┐
│ Deploy host (Ubuntu — /var/www/sebuilderhc/)                │
│   ├─ nginx        → /             SPA static assets         │
│   │              → /api/*        proxy → companion          │
│   ├─ companion    → 127.0.0.1:3001 (Node, systemd-managed)  │
│   │              SQL Server client, DLP REST API client,    │
│   │              Customer Connector job broker, AES decrypt │
│   └─ /var/lib/forcepoint-hc/forcepoint-hc-connector.exe     │
│              served via /api/connector/agent                │
└─────────────────────────────────────────────────────────────┘
        ↑ HTTPS via nginx
        │
   SE browser (the wizard)
        │
        │   (Optional) Customer Connector binary running inside
        │   the customer environment, phones home over outbound
        │   HTTPS — never inbound. Routes SQL + DLP REST API
        ↓   queries when the SE has no direct line of sight.
   Customer FSM host`}
              </pre>
              <Note>
                The wizard never has direct line of sight into the customer's
                environment unless the SE explicitly chooses Direct mode for SQL or
                DLP REST API. By default, every credential touches the customer host only.
              </Note>
            </Section>

            {/* ── 2. NAVIGATION RAIL ────────────────────────────────── */}
            <Section id="navigation" title="2. Navigation rail (left side)">
              <p>
                Seven main pages, plus the companion health pill, user avatar, and
                build version chip at the bottom of the rail.
              </p>
              <NavTable />
              <H2>Why each one matters</H2>
              <ul style={listStyle}>
                <li><strong>HC Sessions</strong> — every customer is saved as a separate session.
                  Export Backup before destructive ops; Import Backup restores the whole estate.</li>
                <li><strong>HC Rule Engine</strong> — the checklist is the spine of the Per-Product
                  Security Assessment. Customise per industry vertical here.</li>
                <li><strong>Product Lifecycle</strong> — Step 4's "EoS — replace immediately"
                  verdict pulls dates from here. Stale catalogue → wrong verdict.</li>
                <li><strong>GenAI Apps &amp; Destination Patterns</strong> — when ChatGPT, Claude
                  etc. ship under new domains, add them here so the posture dashboard correctly
                  attributes incidents.</li>
              </ul>
            </Section>

            {/* ── 3. WIZARD STEPS ──────────────────────────────────── */}
            <Section id="wizard" title="3. The Health Check Wizard — 18 steps">
              <p>
                The wizard is product-aware: some steps are skipped automatically based on
                Step 2 (e.g. Step 6 Endpoint Agent Analysis is DLP-only). The list below is
                the full canonical flow.
              </p>
              <StepCard num="1" color="#3B82F6" title="Customer Information">
                Customer identification + account context.
                Use the <strong>Import JSON from Salesforce</strong> panel at the top for the
                fastest path — drop a <Code>customerx_hc.json</Code> exported via the Claude
                Salesforce Connector. Click <strong>(?) How to generate</strong> for the canonical
                Claude prompt (requires Salesforce Connector + WBSN ID). Customer info,
                licenses, hardware, recent cases, feature requests auto-fill.
              </StepCard>
              <StepCard num="2" color="#8B5CF6" title="Product Scope">
                Tick which Forcepoint products are in scope: Data Security, Web Security,
                Email Security, NGFW, V-Series, etc. Drives step visibility downstream.
              </StepCard>
              <StepCard num="3" color="#0EA5E9" title="Data Collection ⭐">
                The data-ingestion superpage. Independent cards for SQL Server, DLP REST API,
                V-Series API, NGFW SMC API, the report runner, DLP Server Telemetry bundle,
                DLP Manager PDF, Endpoint Agent CSV, and the Customer Connector. Each card's
                <strong> Transport</strong> toggle (where applicable) selects Direct vs Via
                Connector. <strong>Star ★</strong> on log findings auto-spawns Urgent Actions
                and includes them in the report.
              </StepCard>
              <StepCard num="4" color="#F59E0B" title="Version & EoS Analysis">
                For each Forcepoint product in scope: installed version vs latest vs EoS / EoM dates.
                Auto-fills from DLP Server Telemetry where possible. EoS items penalise the
                health score the most (-4 each).
              </StepCard>
              <StepCard num="5" color="#F97316" title="Server Infrastructure">
                For each Forcepoint server: CPU / RAM / disks. Disk ≥85% = critical, 70–85% = warning.
                Auto-fill from DLP Server Telemetry where available.
              </StepCard>
              <StepCard num="6" color="#06B6D4" title="Endpoint Agent Analysis (DLP only)">
                Imports F1E Endpoint console CSV. Aggregates version distribution, stale
                agents (&gt;30d / &gt;90d), client status, top stale samples.
              </StepCard>
              <StepCard num="7" color="#0284C7" title="Agent Compatibility (DLP and/or Web)">
                Cross-references the endpoint fleet against the OS / Browser Support Matrix.
                Output: compatibility verdict + per-OS / per-browser tables + optional Critical
                Notes + upgrade recommendation.
              </StepCard>
              <StepCard num="8" color="#10B981" title="Per-Product Checklist">
                Walks the operator through the questions from the HC Rule Engine. Yes / No / N/A
                + optional analyst note. Trigger value → finding with severity.
              </StepCard>
              <StepCard num="9" color="#6366F1" title="Parsing & Analysis">
                Visualises checklist answers + heuristics: which sections need work, healthy,
                or unanswered.
              </StepCard>
              <StepCard num="10" color="#DB2777" title="Certificate Analysis">
                Drop <Code>.cer / .pem / .crt / .der</Code> files (typically <Code>allcerts.cer</Code> + <Code>ca.cer</Code> from the DLP Server Telemetry).
                Parses subject + issuer + validity + key length + signature algorithm + CA constraint.
              </StepCard>
              <StepCard num="11" color="#EC4899" title="Recommendations">
                Free-form list with category, priority, status, description, remediation.
              </StepCard>
              <StepCard num="12" color="#023E8A" title="Version Upgrade Proposals">
                Pull from the Version &amp; Release Catalog or write custom. Each proposal has
                source → target version, urgency, rationale, deployment notes, optional bug-fix highlights.
              </StepCard>
              <StepCard num="13" color="#14B8A6" title="Customer Feature Requests">
                Tracks what the customer is asking Forcepoint to build. Surfaces in the
                Technical report's Customer Voice section.
              </StepCard>
              <StepCard num="14" color="#7C3AED" title="License Gap">
                Where the customer is under-licensed or mis-licensed. Each gap proposes
                a quantity + rationale. Surfaces in BOTH report variants as Recommended
                License Extension.
              </StepCard>
              <StepCard num="15" color="#EA580C" title="Urgent Actions">
                Time-bound items the customer needs to address quickly. Has owner + due date.
                <strong> Auto-populated entries arrive here when you ★-star a log finding in Step 3.</strong>
              </StepCard>
              <StepCard num="16" color="#0891B2" title="Recommended Enhancements">
                Strategic "what should the customer add to their Forcepoint estate?" pitch.
                Pick from a catalogue or write custom.
              </StepCard>
              <StepCard num="17" color="#3B82F6" title="Summary & Review">
                In-wizard preview of everything: health gauge, severity tiles, risk matrix,
                Coverage Stats, per-product scorecards, compliance lens. Fix issues from the
                sidebar before exporting.
              </StepCard>
              <StepCard num="18" color="#16A34A" title="Final Export">
                Click <strong>Generate Executive Risk Briefing</strong> OR <strong>Generate Health Check Report</strong>.
                New browser tab opens with rendered HTML. Print → Save as PDF from the browser.
              </StepCard>
            </Section>

            {/* ── 4. CUSTOMER CONNECTOR ────────────────────────────── */}
            <Section id="connector" title="4. Customer Connector — the agent">
              <H2>Why it exists</H2>
              <p>
                Many customers won't let an outside HC server reach into their network. The
                connector is a single-binary outbound-only agent the customer runs inside their
                FSM environment. It:
              </p>
              <ol style={listStyle}>
                <li><strong>Phones home</strong> every 30s with a heartbeat (presence + selftest results).</li>
                <li><strong>Long-polls</strong> for jobs — the HC server queues encrypted work; the connector
                  picks them up and executes locally.</li>
                <li><strong>Encrypts every result</strong> with AES-256-GCM using the symmetric key from
                  <Code>connector.json</Code> — even the HC server only sees ciphertext on the wire.</li>
              </ol>
              <H2>Three artifacts you hand the customer</H2>
              <Table headers={['File', 'Origin', 'Contents']} rows={[
                ['connector.json', 'SE generates in wizard', 'HC endpoint, random token, AES-256 key, allowed source IP'],
                ['connector-secrets.json', 'Customer admin fills (or verifies pre-fill)', '3 SQL blocks (sql_Data / sql_Web / sql_Email) + 1 DLP REST API block'],
                ['forcepoint-hc-connector.exe', 'Built from the repo, served by the HC server', 'Single-file Python binary, ~25 MB'],
              ]} />
              <p>
                Customer puts all three in one folder, runs the .exe, sees a console banner.
                The wizard's ONLINE pill turns green within 30s.
              </p>
              <H2>Direct vs Via Connector — when to use which</H2>
              <Table headers={['Mode', 'Best when…', 'Picture']} rows={[
                ['Direct', 'The SE has network reach to the customer FSM (POC / lab / open network).', 'Wizard → companion → customer FSM, all over the SE network.'],
                ['Via Connector', "The customer's firewall blocks inbound. The SE can ONLY reach the connector's outbound heartbeat.", 'Wizard → companion → enqueue job → connector pulls job → connector hits FSM → encrypted result.'],
              ]} />
              <Warn>
                Direct fallback is <strong>never automatic</strong>. If you pick Via Connector but
                the connector is offline, queries fail with a clear error — you have to either
                bring the connector ONLINE or manually switch to Direct.
              </Warn>
              <H2>The SELFTEST panel</H2>
              <p>
                Inside the Customer Connector card, below the status pill, the wizard shows
                what the connector itself is reporting:
              </p>
              <ul style={listStyle}>
                <li><strong>SQL · DLP</strong> — connector tested its <Code>sql_Data</Code> block</li>
                <li><strong>SQL · Web</strong> — connector tested its <Code>sql_Web</Code> block</li>
                <li><strong>SQL · Email</strong> — connector tested its <Code>sql_Email</Code> block</li>
                <li><strong>DLP REST API</strong> — connector tested its <Code>dlpApi</Code> block</li>
              </ul>
              <p>
                Each row is <strong>PASS / FAIL</strong> with latency. Refreshed every 5 minutes
                automatically. If PASS for the product you're about to query, Via Connector
                queries for that product will succeed.
              </p>
            </Section>

            {/* ── 5. SF IMPORT ─────────────────────────────────────── */}
            <Section id="sf-import" title="5. The Salesforce JSON import">
              <p>
                Step 1 has a panel labelled <strong>Import JSON from Salesforce</strong>. Click the
                <strong> (?) How to generate</strong> button for the canonical Claude prompt.
              </p>
              <H2>Prereqs</H2>
              <ul style={listStyle}>
                <li>Salesforce Connector enabled on your Claude account</li>
                <li>The customer's <strong>WBSN ID</strong> (Salesforce account identifier)</li>
              </ul>
              <H2>Flow</H2>
              <ol style={listStyle}>
                <li>Open Claude in another tab</li>
                <li>Paste the prompt template (Copy button on the help panel) and replace <Code>&lt;PASTE_WBSN_ID_HERE&gt;</Code> with the real ID</li>
                <li>Claude returns a JSON document</li>
                <li>Save as <Code>customerx_hc.json</Code> (the filename is free; the wizard doesn't care)</li>
                <li>Drop into the wizard's dropzone</li>
              </ol>
              <Note>
                When the customer name is sensitive, <strong>ALWAYS</strong> use Salesforce import — never
                type the name in cleartext. The data flows directly from SF without showing up in
                the browser address bar or screen-share captures. Everything stays editable after
                import.
              </Note>
            </Section>

            {/* ── 6. REPORTS ──────────────────────────────────────── */}
            <Section id="reports" title="6. Reports">
              <H2>Generation</H2>
              <p>
                Step 18 → click <strong>Generate Executive Risk Briefing</strong> OR <strong>Generate Health Check Report</strong>.
                New browser tab opens with the rendered HTML. Print → Save as PDF from the browser.
              </p>
              <H2>Executive Risk Briefing (~10 pages)</H2>
              <pre style={preStyle}>
{`Cover
Part 1 · Executive Briefing
   Section 1 · Risk Posture & Executive Summary
   Section 2 · Compliance Exposure
   Section 3 · Current Licensing Posture           ← inventory + expiry
Part 2 · Security Posture
   Section 4 · Information Security Posture Dashboard   ← DLP REST API telemetry
Part 3 · Roadmap & Strategy
   Section 5 · Recommended License Extension       ← what to buy
   Section 6 · Recommended Enhancements             ← strategic adds
Closing`}
              </pre>
              <H2>Health Check &amp; Maturity Assessment (~40-60 pages)</H2>
              <p>
                Includes Parts I–IV — full Part II Technical Assessment (Version Lifecycle, Server
                Health, DLP Telemetry, DLP Log Evidence, Endpoint Agents, Agent Compatibility,
                Certificates, Product Scorecards, Feature Posture Control, per-product Usage
                sections, Posture Telemetry). Part III adds prioritized recommendations, version
                upgrade path, action items, customer FRs, licensing roadmap, enhancements. Part IV
                has the scoring rubric appendix.
              </p>
              <H2>Tips</H2>
              <ul style={listStyle}>
                <li>Always run Step 17 (Summary &amp; Review) first to catch missing data before generating.</li>
                <li>Health score &lt; 60 = AT RISK; &lt; 40 = CRITICAL.</li>
                <li>Coverage Stats in Step 17 tells you exactly what evidence the reports will cite. Empty rows = thin report.</li>
              </ul>
            </Section>

            {/* ── 7. WORKFLOWS ────────────────────────────────────── */}
            <Section id="workflows" title="7. Common workflows">
              <WorkflowCard letter="A" title="Greenfield Health Check (SE has L3 reach to customer)">
                <ol style={listStyle}>
                  <li><strong>HC Sessions</strong> → Start new wizard session</li>
                  <li><strong>Step 1</strong> — Import Salesforce JSON via Claude prompt</li>
                  <li><strong>Step 2</strong> — Tick Data Security (and Web Security if in scope)</li>
                  <li><strong>Step 3</strong> — Direct mode on SQL Server + DLP REST API. Test Connection both. Drop the DLP Server Telemetry folder.</li>
                  <li><strong>Step 3 Reports</strong> — tick the relevant reports (DLP / Web by scope), bulk Run</li>
                  <li><strong>Step 3 → Fetch posture data</strong> (DLP REST API)</li>
                  <li><strong>Steps 4–16</strong> — fill in / verify auto-populated data</li>
                  <li><strong>Step 17</strong> — eyeball Coverage Stats</li>
                  <li><strong>Step 18</strong> — Generate both Executive + Technical</li>
                </ol>
              </WorkflowCard>
              <WorkflowCard letter="B" title="Customer with strict firewall (SE has NO L3 reach)">
                <ol style={listStyle}>
                  <li>Same Steps 1–2</li>
                  <li><strong>Step 3 Customer Connector card</strong> — Enable. Download three artifacts. Hand to customer admin. Wait for ONLINE pill.</li>
                  <li><strong>Step 3 SQL Server + DLP REST API cards</strong> — pick <strong>Via Connector</strong> mode on both. SELFTEST panel above shows PASS for the relevant products.</li>
                  <li><strong>Step 3 Reports + Posture</strong> — bulk Run + Fetch as normal. Every call routes through the connector.</li>
                  <li>Steps 4-16, 17, 18 — same.</li>
                </ol>
              </WorkflowCard>
              <WorkflowCard letter="C" title="Log analysis only (no SQL access)">
                <ol style={listStyle}>
                  <li>Steps 1–2 normal</li>
                  <li><strong>Step 3 DLP Server Telemetry card</strong> — drop the bundle</li>
                  <li>Browse the <strong>DLP Log &amp; Audit Findings</strong> + <strong>Service Logs</strong> panels.
                    Star ★ the relevant findings — they auto-spawn Urgent Actions and appear in
                    the report's Log Evidence section.</li>
                  <li>Skip everything else, jump to Step 18</li>
                </ol>
              </WorkflowCard>
              <WorkflowCard letter="D" title="Recurring engagement (data refresh)">
                <ol style={listStyle}>
                  <li><strong>HC Sessions</strong> → open the previous session</li>
                  <li>Step 3 → re-Run reports + re-Fetch posture for the new time window</li>
                  <li>Step 17 → confirm metrics moved</li>
                  <li>Step 18 → re-export</li>
                </ol>
              </WorkflowCard>
            </Section>

            {/* ── 8. TROUBLESHOOTING ──────────────────────────────── */}
            <Section id="troubleshoot" title="8. Troubleshooting">
              <Table headers={['Symptom', 'Most likely cause', 'Fix']} rows={[
                ['Companion health pill RED', 'Companion service down on deploy host', 'sudo systemctl status sebuilderhc-companion then restart'],
                ['Customer Connector OFFLINE despite running', 'Token mismatch (rotation) OR allowlist IP mismatch', 'Compare wizard token with the one in connector.json on customer host'],
                ['Test Connection (Direct SQL) says "Local SQL companion not running"', 'nginx → companion proxy chain broken', 'curl http://127.0.0.1:3001/health on deploy host'],
                ['Run buttons grayed out', 'SQL Server card not enabled OR (Via Connector mode) connector not ONLINE', 'Enable the card; for Via Connector, wait until ONLINE pill'],
                ['Posture fetch times out', 'FSM REST API busy OR creds wrong', 'Test Connection first; if Test passes, raise the timeout'],
                ['Show JSON button empty in via-connector mode', 'customerConnector state not flushed', 'Hard reload (Ctrl+Shift+R)'],
                ['Executive Report missing Section 3 Licensing', 'No licenses captured AND no support level set', 'Step 1 manually adds licenses OR re-import SF JSON'],
                ['Report shows stale section numbers', 'Browser cached old build', 'Hard reload'],
              ]} />

              <H2>Diagnostic commands (deploy host)</H2>
              <pre style={preStyle}>
{`# Companion liveness
sudo systemctl status sebuilderhc-companion
sudo journalctl -u sebuilderhc-companion -n 40 --no-pager

# Connector binary present?
ls -lh /var/lib/forcepoint-hc/forcepoint-hc-connector.exe

# Connector .exe download endpoint
curl -I http://127.0.0.1:3001/api/connector/agent

# Job queue endpoint
curl -s http://127.0.0.1:3001/api/connector/status?token=<token-prefix>`}
              </pre>

              <H2>Customer-side diagnostic</H2>
              <p>When the customer admin runs the connector, the console shows:</p>
              <pre style={preStyle}>
{`+----------------------------------------------------------+
|  Forcepoint HC -- Customer Connector  v0.1.0             |
+----------------------------------------------------------+
  HC endpoint:        https://hc.forcepoint-se.com
  Token (masked):     ab12cd34...
  ...
[selftest] Validating local credentials before starting heartbeat loop...
  OK    SQL DLP     wbsn-data-security authenticated (3 ms)
  OK    DLP REST API authenticated — DLP v10.3.0 (251 ms)

[start] Phoning home to https://hc.forcepoint-se.com/api/connector/heartbeat
[job-poll] active. Long-polling https://hc.forcepoint-se.com/api/connector/job/next...
[14:32:01] OK    heartbeat #1  (84ms)`}
              </pre>
              <p>
                If <Code>[job-poll] active</Code> is missing, the binary was built without the
                <Code>cryptography</Code> library or the <Code>encryptionKeyHex</Code> in <Code>connector.json</Code>
                is wrong — rebuild + re-deploy.
              </p>
            </Section>

            {/* ── 9. QUICK REFERENCE ──────────────────────────────── */}
            <Section id="quickref" title="9. Quick reference">
              <Table headers={['Action', 'Where']} rows={[
                ['Resume the active session', 'Click the wizard step number in the sidebar'],
                ['Save the session manually', 'Bottom panel "Save" button — auto-saves on every step transition too'],
                ['Export full estate backup', 'HC Sessions page → Export Backup'],
                ['Import estate backup', 'HC Sessions page → Import Backup (destructive)'],
                ['Show JSON preview', 'Customer Connector card → eye icon next to each Download button'],
                ['Generate the Claude prompt', 'Step 1 → SF EXPORT section → (?) How to generate'],
                ['See build version', 'Bottom of left nav rail — short SHA chip, hover for full info'],
                ['Toggle this Help Guide', 'Left nav rail — Help Guide button'],
              ]} />
            </Section>

            {/* ── 10. UPDATE WORKFLOW ─────────────────────────────── */}
            <Section id="updates" title="10. Update workflow (for the SE Admin)">
              <p>When the dev team ships a new build:</p>
              <pre style={preStyle}>
{`# On the deploy host (Ubuntu)
cd ~/SeBuilderHC2026
git pull
sudo bash deploy.sh
bash statuscheck.sh`}
              </pre>
              <p>When a new connector .exe is released:</p>
              <ul style={listStyle}>
                <li><Code>deploy.sh</Code> automatically copies the new binary out of <Code>ConnectorAgent/forcepoint-hc-connector.exe</Code> (in the repo) to <Code>/var/lib/forcepoint-hc/</Code>.</li>
                <li>The wizard's "Download forcepoint-hc-connector.exe" button serves the latest copy from that path.</li>
                <li>Customers who installed an older .exe should re-download + replace on their host. The token + secrets file don't need to change.</li>
              </ul>
            </Section>

            {/* ── 11. NEVERS ──────────────────────────────────────── */}
            <Section id="nevers" title="11. Things to NEVER do">
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #DC2626', borderRadius: 8, padding: '14px 18px' }}>
                <ul style={{ ...listStyle, margin: 0 }}>
                  <li>Edit a session's JSON in localStorage by hand — corrupts the state machine.</li>
                  <li>Type the customer name in cleartext when capturing screenshots — use Salesforce import.</li>
                  <li>Push connector binaries with <Code>-dirty</Code> build tag to customers.</li>
                  <li>Run the connector .exe with <Code>--insecure</Code> against a production customer (dev only).</li>
                  <li>Hand the customer the <Code>connector-secrets.json</Code> from a different customer engagement — leaks data.</li>
                </ul>
              </div>
            </Section>

            {/* ── 12. HELP ────────────────────────────────────────── */}
            <Section id="help" title="12. Where to ask for help">
              <ul style={listStyle}>
                <li><strong>Build / deploy issues</strong> — check <Code>journalctl -u sebuilderhc-companion</Code> first, then email Kemal with the build SHA from the nav rail chip.</li>
                <li><strong>Logic / template questions</strong> — the HC Rule Engine page is fully editable; experiment safely (Export Backup first).</li>
                <li><strong>Customer-side connector issues</strong> — get the console output from the customer's .exe session; the <Code>[selftest]</Code> lines + any <Code>REJECT/UNREGISTERED</Code> or <Code>REJECT/ALLOWLIST</Code> lines tell you exactly what's wrong.</li>
              </ul>

              <div className="mt-6 p-5 rounded-xl"
                style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.06), rgba(124,58,237,0.06))', border: '1px solid rgba(29,78,216,0.18)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <Mail size={16} style={{ color: '#1D4ED8' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F2952' }}>Contact</span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.65, margin: 0 }}>
                  Kemal ARTIKARSLAN — <a href="mailto:kartikarslan@forcepoint.com" style={{ color: '#1D4ED8', fontWeight: 600 }}>kartikarslan@forcepoint.com</a>
                  <br />
                  Forcepoint SE · HC Wizard developer · open to feature requests, custom industry
                  checklists, and connector binary release coordination.
                </p>
              </div>

              <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: 20, fontStyle: 'italic' }}>
                This in-app guide mirrors <Code>AdminGuide.md</Code> at the repo root. The two are kept in sync.
              </p>
            </Section>

            {/* Bottom spacer so the last section can scroll to the top */}
            <div style={{ height: 200 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Small presentational helpers — keep the body of the guide tidy.
   ─────────────────────────────────────────────────────────────── */

const listStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 12,
  paddingLeft: 22,
  fontSize: '13px',
  color: '#334155',
  lineHeight: 1.75,
};

const preStyle: React.CSSProperties = {
  fontSize: '11.5px',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  color: '#0F172A',
  padding: '14px 18px',
  borderRadius: 8,
  lineHeight: 1.6,
  overflow: 'auto',
  fontFamily: "'JetBrains Mono', monospace",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section data-section-id={id} className="mb-10 scroll-mt-4">
      <h1 style={{
        fontSize: '22px',
        fontWeight: 800,
        color: '#0F2952',
        letterSpacing: '-0.01em',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '2px solid #E2E8F0',
      }}>
        {title}
      </h1>
      <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: '15px',
      fontWeight: 700,
      color: '#0F2952',
      marginTop: 22,
      marginBottom: 10,
      letterSpacing: '-0.005em',
    }}>
      {children}
    </h2>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12px',
      background: '#F1F5F9',
      color: '#0F2952',
      padding: '1px 6px',
      borderRadius: 4,
      border: '1px solid #E2E8F0',
    }}>
      {children}
    </code>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 px-4 py-3 rounded-lg"
      style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderLeft: '4px solid #0EA5E9' }}>
      <div style={{ fontSize: '10px', fontWeight: 800, color: '#0369A1', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
        Note
      </div>
      <div style={{ fontSize: '12.5px', color: '#0C4A6E', lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 px-4 py-3 rounded-lg"
      style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '4px solid #D97706' }}>
      <div style={{ fontSize: '10px', fontWeight: 800, color: '#92400E', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
        Warning
      </div>
      <div style={{ fontSize: '12.5px', color: '#92400E', lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  );
}

function StepCard({ num, color, title, children }: { num: string; color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-4 p-4 rounded-lg"
      style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold"
        style={{ background: `${color}1A`, color: color, border: `1px solid ${color}40`, fontSize: '13px' }}>
        {num}
      </div>
      <div className="flex-1">
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F2952', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.7 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function WorkflowCard({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 p-4 rounded-lg"
      style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold"
          style={{ background: 'linear-gradient(135deg,#1D4ED8,#7C3AED)', color: '#fff', fontSize: '11px' }}>
          {letter}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F2952' }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            {headers.map((h, i) => (
              <th key={i}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: '#0F2952',
                  fontWeight: 700,
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid #E2E8F0',
                }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFCFF' }}>
              {row.map((cell, j) => (
                <td key={j}
                  style={{
                    padding: '8px 12px',
                    color: '#334155',
                    lineHeight: 1.55,
                    borderBottom: '1px solid #F1F5F9',
                    verticalAlign: 'top',
                  }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NavTable() {
  const rows: string[][] = [
    ['Health Check Wizard', 'Starts a new session OR resumes the active session. The 18-step assessment.'],
    ['HC Sessions', 'List of every saved session. Customer name, last-saved date, completion state, health score. Right toolbar: Export/Import Backup of the whole estate.'],
    ['HC Rule Engine', 'Edit the checklist templates (DLP / Web / Email). Per-product questions, severity weights, remediation text. Changes apply to future sessions.'],
    ['Product Lifecycle', 'Catalogue of Forcepoint product versions + EoS / EoM dates. Auto-pulled into Step 4. Update when Forcepoint publishes new EoS notices.'],
    ['OS / Browser Support Matrix', 'Endpoint agent compatibility matrix (Windows / macOS / browsers). Drives Step 7. Update when new platforms ship.'],
    ['GenAI Apps & Destination Patterns', 'Substring patterns that classify URLs as GenAI / SaaS / Webmail for the DLP REST API posture aggregator.'],
    ['Version & Release Catalog', 'Pre-canned version-upgrade proposals (e.g. "DLP 25.05 → 26.02"). Step 12 pulls from this.'],
  ];
  return <Table headers={['Menu', 'Purpose']} rows={rows} />;
}
