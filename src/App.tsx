import { useEffect, useMemo, useState } from "react";
import type {
  AssessmentReport,
  ArtifactManifest,
  Finding,
  ToolPassportCredential,
} from "./domain/contracts";
import type { CommunityCredentialVerification } from "./credentials/communityIssuer";
import { LocalTrustProvider } from "./providers/localTrustProvider";
import type { SubmissionResult } from "./providers/trustProvider";
import { safeManifest, riskyManifest } from "./scanner/fixtures";

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
  const [provider, setProvider] = useState(() => new LocalTrustProvider());
  const [submission, setSubmission] = useState<SubmissionResult>();
  const [report, setReport] = useState<AssessmentReport>();
  const [credential, setCredential] = useState<ToolPassportCredential>();
  const [verification, setVerification] = useState<CommunityCredentialVerification>();
  const [scanning, setScanning] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string>();
  const manifest: ArtifactManifest = fixtureKey === "safe" ? safeManifest : riskyManifest;

  useEffect(() => {
    setProvider(new LocalTrustProvider());
    setSubmission(undefined);
    setReport(undefined);
    setCredential(undefined);
    setVerification(undefined);
    setError(undefined);
  }, [fixtureKey]);

  const runAssessment = async () => {
    setScanning(true);
    setError(undefined);
    setCredential(undefined);
    setVerification(undefined);
    try {
      const nextSubmission = await provider.submitArtifact(manifest);
      const nextReport = await provider.assessArtifact(nextSubmission.artifactVersion.id);
      setSubmission(nextSubmission);
      setReport(nextReport);
    } catch (caught) {
      setSubmission(undefined);
      setReport(undefined);
      setError(caught instanceof Error ? caught.message : "Assessment failed.");
    } finally {
      setScanning(false);
    }
  };

  const issuePassport = async () => {
    if (!submission || !report) return;
    setIssuing(true);
    setError(undefined);
    try {
      const nextCredential = await provider.issueToolPassport(
        submission.artifactVersion.id,
        manifest.tools[0].name,
      );
      const nextVerification = await provider.verifyToolPassport(nextCredential);
      setCredential(nextCredential);
      setVerification(nextVerification);
    } catch (caught) {
      setCredential(undefined);
      setVerification(undefined);
      setError(caught instanceof Error ? caught.message : "Tool Passport issuance failed.");
    } finally {
      setIssuing(false);
    }
  };

  const sortedFindings = useMemo(
    () => [...(report?.findings ?? [])].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [report],
  );
  const snapshot = provider.snapshot();
  const completedWorkflowSteps = credential ? 3 : report ? 2 : submission ? 1 : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">F</span>
          <div>
            <strong>FLINT</strong>
            <span>AgentGate Community</span>
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
            <strong>Local provider ready</strong>
            <span>No FLINT credential required</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">COMMUNITY TRUST PLANE / {view.toUpperCase()}</p>
            <h1>{view === "assessments" ? "Tool assessment" : "From submitted tool to governed capability"}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone="demo">DEMO DATA</StatusPill>
            <button className="secondary-button" type="button" onClick={() => setView("evidence")}>View evidence</button>
          </div>
        </header>

        <section className="notice" aria-label="Community assurance notice">
          <span>COMMUNITY ASSURANCE</span>
          <p>Credentials issued here are locally self-attested. Their integrity is verifiable, but they are not a FLINT Stamp or FLINT-verified assurance.</p>
        </section>

        <section className="workflow-steps" aria-label="Tool assurance workflow">
          {["Submit exact version", "Assess evidence", "Issue community passport", "Assign through Gateway"].map((label, index) => (
            <div className={completedWorkflowSteps > index ? "workflow-step complete" : "workflow-step"} key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </section>

        <section className="metric-grid" aria-label="Current session summary">
          <article>
            <span>Publisher Passports</span>
            <strong>{submission ? 1 : 0}</strong>
            <small>Self-attested in this clone</small>
          </article>
          <article>
            <span>Artifact versions</span>
            <strong>{snapshot.artifactVersions.length}</strong>
            <small>Immutable SHA-256 bindings</small>
          </article>
          <article>
            <span>Community passports</span>
            <strong>{snapshot.credentials.length}</strong>
            <small>Locally signed credentials</small>
          </article>
          <article>
            <span>FLINT Stamps</span>
            <strong>0</strong>
            <small>Command verification required</small>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel assessment-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">PUBLISHER INTAKE</p>
                <h2>Submit an exact tool version</h2>
              </div>
              <StatusPill tone={report?.verdict?.toLowerCase() ?? "neutral"}>{scanning ? "ASSESSING" : report?.verdict ?? "READY"}</StatusPill>
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

            {submission && (
              <div className="intake-receipt">
                <span>Immutable version</span>
                <code>{submission.artifactVersion.id}</code>
                <small>{submission.artifactVersion.digest}</small>
              </div>
            )}

            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="primary-button" type="button" disabled={scanning || issuing} onClick={() => void runAssessment()}>
              {scanning ? "Submitting and assessing…" : report ? "Re-submit exact version" : "Submit exact version & assess"}
            </button>
          </article>

          <article className="panel result-panel">
            <div className="result-heading">
              <ScoreRing report={report} />
              <div>
                <p className="eyebrow">FLINT ASSESSMENT CONTRACT V0</p>
                <h2>{report?.verdict === "PASS" ? "Eligible for community issuance" : report?.verdict === "FAIL" ? "Tool Passport blocked" : report?.verdict === "ERROR" ? "Assessment failed closed" : report ? "Controls required" : "Awaiting exact-version submission"}</h2>
                <p>{report ? `${report.findings.length} findings across declared instructions, schemas, annotations, and destinations.` : "Submit the selected manifest to create its immutable version and assessment evidence."}</p>
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
                <span>Adapter</span>
                <strong>{report ? `${provider.scanner.descriptor.displayName} · ${report.scanner.version}` : "Community Scanner"}</strong>
              </div>
            </div>

            <div className="findings-list">
              {report?.failure ? (
                <div className="empty-finding failed-closed">
                  <span>!</span>
                  <div><strong>{report.failure.code}</strong><p>{report.failure.message} This result cannot support a Tool Passport or FLINT Stamp.</p></div>
                </div>
              ) : !report ? (
                <div className="empty-finding neutral-finding">
                  <span>·</span>
                  <div><strong>No assessment yet</strong><p>The local provider keeps the builder flow credential-free and executes no submitted tool process.</p></div>
                </div>
              ) : sortedFindings.length === 0 ? (
                <div className="empty-finding">
                  <span>✓</span>
                  <div><strong>No deterministic risks detected</strong><p>This bounded result can support a self-attested community credential. FLINT verification requires Command.</p></div>
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

            <button
              className="passport-button"
              type="button"
              disabled={issuing || report?.verdict !== "PASS" || !submission}
              onClick={() => void issuePassport()}
            >
              {issuing ? "Signing community credential…" : credential ? "Re-issue community Tool Passport" : "Issue community Tool Passport"}
            </button>
          </article>
        </section>

        {credential && verification && (
          <section className="panel credential-panel" aria-label="Issued Tool Passport">
            <div className="credential-heading">
              <div>
                <p className="eyebrow">SIGNED TOOL PASSPORT</p>
                <h2>{credential.passport.toolName}</h2>
              </div>
              <StatusPill tone={verification.integrityValid ? "pass" : "fail"}>
                {verification.integrityValid ? "SIGNATURE VALID" : "SIGNATURE INVALID"}
              </StatusPill>
            </div>
            <div className="assurance-grid">
              <div><span>Assurance</span><strong>COMMUNITY SELF-ATTESTED</strong></div>
              <div><span>FLINT verified</span><strong>NO</strong></div>
              <div><span>Issuer</span><strong>{credential.passport.issuerId}</strong></div>
              <div><span>Exact version</span><strong>{credential.passport.artifactVersion}</strong></div>
              <div><span>Assessment</span><strong>{credential.passport.assessmentId}</strong></div>
              <div><span>Verification method</span><strong>{credential.proof.verificationMethod}</strong></div>
            </div>
            <div className="proof-row">
              <span>Proof</span>
              <code>{credential.proof.proofValue}</code>
            </div>
            <div className="managed-callout">
              <div>
                <strong>Need authoritative assurance?</strong>
                <p>FLINT Command adds managed identity, continuous reassessment, FLINT-controlled signing, revocation, monitoring, and network intelligence.</p>
              </div>
              <a href="https://flint.network/command/app" target="_blank" rel="noreferrer">Open FLINT Command</a>
            </div>
          </section>
        )}

        <section className="panel policy-strip">
          <div>
            <p className="eyebrow">RUNTIME INTERSECTION</p>
            <h2>Identity ∩ Passport ∩ Assignment ∩ Context</h2>
          </div>
          <div className="policy-flow" aria-label="Gateway policy sequence">
            <span>Agent identity</span><b>→</b><span>Semantic authority</span><b>→</b><span>Assessed tool</span><b>→</b><span>Signed decision</span>
          </div>
          <StatusPill tone="pass">FAIL CLOSED</StatusPill>
        </section>
      </main>
    </div>
  );
}

export default App;
