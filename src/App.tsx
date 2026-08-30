import { useEffect, useMemo, useState } from "react";
import type { AssessmentReport, ArtifactManifest, Finding } from "./domain/contracts";
import { safeManifest, riskyManifest } from "./scanner/fixtures";
import { scanManifest } from "./scanner/scanManifest";

type View = "overview" | "registry" | "assessments" | "gateway" | "evidence";
type FixtureKey = "safe" | "risky";

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "overview", label: "Overview", glyph: "01" },
  { id: "registry", label: "Identity registry", glyph: "02" },
  { id: "assessments", label: "Tool assessments", glyph: "03" },
  { id: "gateway", label: "Gateway policy", glyph: "04" },
  { id: "evidence", label: "Evidence log", glyph: "05" },
];

const severityOrder: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function ScoreRing({ report }: { report?: AssessmentReport }) {
  const score = report?.score ?? 0;
  const tone = report?.verdict === "PASS" ? "pass" : report?.verdict === "FAIL" ? "fail" : "conditional";
  return (
    <div className={`score-ring score-${tone}`}>
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <circle className="score-track" cx="21" cy="21" r="15.9" pathLength="100" />
        <circle className="score-meter" cx="21" cy="21" r="15.9" pathLength="100" strokeDasharray={`${score} ${100 - score}`} />
      </svg>
      <div>
        <strong>{report ? score : "–"}</strong>
        <span>trust score</span>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("overview");
  const [fixtureKey, setFixtureKey] = useState<FixtureKey>("safe");
  const [report, setReport] = useState<AssessmentReport>();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();
  const manifest: ArtifactManifest = fixtureKey === "safe" ? safeManifest : riskyManifest;

  const runScan = async (target = manifest) => {
    setScanning(true);
    setError(undefined);
    try {
      setReport(await scanManifest(target));
    } catch (caught) {
      setReport(undefined);
      setError(caught instanceof Error ? caught.message : "Assessment failed.");
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void runScan(manifest);
    // The fixture change is the intended assessment trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureKey]);

  const sortedFindings = useMemo(
    () => [...(report?.findings ?? [])].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [report],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">F</span>
          <div>
            <strong>FLINT</strong>
            <span>AgentGate</span>
          </div>
        </div>

        <nav aria-label="Primary">
          {navItems.map((item) => (
            <button
              type="button"
              className={view === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setView(item.id)}
            >
              <span>{item.glyph}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="system-state">
          <span className="live-dot" />
          <div>
            <strong>Policy plane online</strong>
            <span>Demo environment</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">ENTERPRISE CONTROL PLANE / {view.toUpperCase()}</p>
            <h1>{view === "assessments" ? "Tool assessment" : "Agent security posture"}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone="demo">DEMO DATA</StatusPill>
            <button className="secondary-button" type="button" onClick={() => setView("evidence")}>View evidence</button>
          </div>
        </header>

        <section className="notice" aria-label="Demo notice">
          <span>SIMULATED ENVIRONMENT</span>
          <p>This prototype runs a bounded static assessment in your browser. It does not execute, install, or contact the submitted tool.</p>
        </section>

        <section className="metric-grid" aria-label="Posture summary">
          <article>
            <span>Known agents</span>
            <strong>24</strong>
            <small>22 active · 2 frozen</small>
          </article>
          <article>
            <span>Stamped tools</span>
            <strong>41</strong>
            <small>Exact-version approvals</small>
          </article>
          <article>
            <span>Gateway coverage</span>
            <strong>87%</strong>
            <small>Observed, not claimed inventory</small>
          </article>
          <article>
            <span>Blocked calls · 24h</span>
            <strong>17</strong>
            <small>Policy enforced before execution</small>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel assessment-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">ARTIFACT INTAKE</p>
                <h2>Assess a tool manifest</h2>
              </div>
              <StatusPill tone={report?.verdict?.toLowerCase() ?? "neutral"}>{scanning ? "SCANNING" : report?.verdict ?? "READY"}</StatusPill>
            </div>

            <div className="fixture-switch" role="group" aria-label="Demo artifact">
              <button type="button" className={fixtureKey === "safe" ? "selected" : ""} onClick={() => setFixtureKey("safe")}>Catalog lookup</button>
              <button type="button" className={fixtureKey === "risky" ? "selected" : ""} onClick={() => setFixtureKey("risky")}>Autonomous operator</button>
            </div>

            <div className="artifact-summary">
              <div>
                <span>Publisher</span>
                <strong>{manifest.publisher.displayName}</strong>
              </div>
              <div>
                <span>Artifact</span>
                <strong>{manifest.artifact.name}</strong>
              </div>
              <div>
                <span>Version</span>
                <strong>{manifest.artifact.version}</strong>
              </div>
              <div>
                <span>Declared tools</span>
                <strong>{manifest.tools.length}</strong>
              </div>
            </div>

            <div className="manifest-preview">
              <div className="manifest-topline">
                <span>{manifest.tools[0].name}</span>
                <span>{manifest.tools[0].annotations.readOnly ? "READ ONLY" : "MUTATING"}</span>
              </div>
              <p>{manifest.tools[0].description}</p>
              <div className="tag-row">
                {manifest.tools[0].capabilities.map((capability) => <span key={capability}>{capability}</span>)}
              </div>
            </div>

            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="primary-button" type="button" disabled={scanning} onClick={() => void runScan()}>
              {scanning ? "Running bounded assessment…" : "Run assessment"}
            </button>
          </article>

          <article className="panel result-panel">
            <div className="result-heading">
              <ScoreRing report={report} />
              <div>
                <p className="eyebrow">FLINT ASSESSMENT CONTRACT V0</p>
                <h2>{report?.verdict === "PASS" ? "Eligible for stamp review" : report?.verdict === "FAIL" ? "Stamp blocked" : report?.verdict === "ERROR" ? "Assessment failed closed" : "Controls required"}</h2>
                <p>{report?.findings.length ?? 0} findings across declared instructions, schemas, annotations, and destinations.</p>
              </div>
            </div>

            <div className="contract-meta">
              <div className="digest-row">
                <span>Artifact digest</span>
                <code>{report?.artifactDigest ?? "Unavailable"}</code>
              </div>
              <div className="coverage-row">
                <span>Coverage</span>
                <strong>{report ? `${report.coverage.status.toUpperCase()} · ${report.coverage.completedChecks}/${report.coverage.requiredChecks}` : "Awaiting assessment"}</strong>
              </div>
              <div className="coverage-row">
                <span>Policy</span>
                <strong>{report ? `${report.policy.id} · ${report.policy.version}` : "Awaiting assessment"}</strong>
              </div>
            </div>

            <div className="findings-list">
              {report?.failure ? (
                <div className="empty-finding failed-closed">
                  <span>!</span>
                  <div><strong>{report.failure.code}</strong><p>{report.failure.message} This result cannot support a FLINT Stamp.</p></div>
                </div>
              ) : sortedFindings.length === 0 ? (
                <div className="empty-finding">
                  <span>✓</span>
                  <div><strong>No deterministic risks detected</strong><p>Human review and deeper adapters remain required before a FLINT Stamp is issued.</p></div>
                </div>
              ) : sortedFindings.slice(0, 5).map((finding) => (
                <div className="finding" key={finding.id}>
                  <StatusPill tone={finding.severity}>{finding.severity.toUpperCase()}</StatusPill>
                  <div>
                    <strong>{finding.title}</strong>
                    <p>{finding.evidence}</p>
                    <code>{finding.riskId}</code>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="panel policy-strip">
          <div>
            <p className="eyebrow">RUNTIME INTERSECTION</p>
            <h2>Identity ∩ Stamp ∩ Assignment ∩ Context</h2>
          </div>
          <div className="policy-flow" aria-label="Gateway policy sequence">
            <span>Agent identity</span><b>→</b><span>Semantic authority</span><b>→</b><span>Stamped tool</span><b>→</b><span>Signed decision</span>
          </div>
          <StatusPill tone="pass">ENFORCED</StatusPill>
        </section>
      </main>
    </div>
  );
}

export default App;
