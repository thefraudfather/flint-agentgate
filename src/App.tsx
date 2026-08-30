import { useMemo, useState } from "react";
import type {
  AssessmentReport,
  AssignmentGrant,
  ArtifactManifest,
  Finding,
  GatewayDecision,
  InvocationEvidenceCredential,
  ObservedAgent,
  ToolPassportCredential,
} from "./domain/contracts";
import { artifactManifestSchema } from "./domain/contracts";
import type { CommunityCredentialVerification } from "./credentials/communityIssuer";
import { LocalTrustProvider } from "./providers/localTrustProvider";
import type { SubmissionResult } from "./providers/trustProvider";
import { seedDemoRegistry } from "./registry/demoRegistry";
import { safeManifest, riskyManifest } from "./scanner/fixtures";
import {
  ConditionalWebMcpGateway,
  type GatewaySurfaceState,
} from "./webmcp/conditionalGateway";
import type { GatewayInvocationRequest } from "./gateway/runtimeGateway";
import { CommunityFleetConstellation } from "./components/CommunityFleetConstellation";
import {
  AssessmentIntakeForm,
  type AssessmentPreset,
} from "./components/AssessmentIntakeForm";

type View = "overview" | "registry" | "assessments" | "gateway" | "evidence";

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "overview", label: "Overview", glyph: "01" },
  { id: "registry", label: "Identity registry", glyph: "02" },
  { id: "assessments", label: "Tool assessments", glyph: "03" },
  { id: "gateway", label: "Gateway policy", glyph: "04" },
  { id: "evidence", label: "Evidence log", glyph: "05" },
];

const VIEW_TITLE: Record<View, string> = {
  overview: "From submitted tool to governed capability",
  registry: "Identity registry",
  assessments: "Tool assessments",
  gateway: "MCP gateway policy",
  evidence: "Signed evidence log",
};

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

function ViewEmptyState({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="panel view-empty-state">
      <span className="view-empty-glyph" aria-hidden="true">◇</span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{body}</p>
        <button className="primary-button view-empty-action" type="button" onClick={onAction}>{actionLabel}</button>
      </div>
    </section>
  );
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
        <strong>{report ? score : "N/A"}</strong>
        <span>trust score</span>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("overview");
  const [fixtureKey, setFixtureKey] = useState<AssessmentPreset>("safe");
  const [manifest, setManifest] = useState<ArtifactManifest>(() => structuredClone(safeManifest));
  const [schemaDraft, setSchemaDraft] = useState(() => JSON.stringify(safeManifest.tools[0].inputSchema, null, 2));
  const [schemaError, setSchemaError] = useState<string>();
  const [intakeError, setIntakeError] = useState<string>();
  const [provider, setProvider] = useState(() => new LocalTrustProvider());
  const [submission, setSubmission] = useState<SubmissionResult>();
  const [report, setReport] = useState<AssessmentReport>();
  const [credential, setCredential] = useState<ToolPassportCredential>();
  const [verification, setVerification] = useState<CommunityCredentialVerification>();
  const [registryContext, setRegistryContext] = useState<ReturnType<typeof seedDemoRegistry>>();
  const [identityState, setIdentityState] = useState<ObservedAgent["state"]>("observed");
  const [assignment, setAssignment] = useState<AssignmentGrant>();
  const [gateway, setGateway] = useState<ConditionalWebMcpGateway>();
  const [gatewaySurface, setGatewaySurface] = useState<GatewaySurfaceState>();
  const [runtimeDecision, setRuntimeDecision] = useState<GatewayDecision>();
  const [invocationEvidence, setInvocationEvidence] = useState<InvocationEvidenceCredential>();
  const [invoking, setInvoking] = useState(false);
  const [invocationSequence, setInvocationSequence] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string>();

  const openView = (nextView: View) => {
    setView(nextView);
    window.requestAnimationFrame(() => window.scrollTo({ left: 0, top: 0 }));
  };

  const clearWorkflowState = () => {
    setProvider(new LocalTrustProvider());
    setSubmission(undefined);
    setReport(undefined);
    setCredential(undefined);
    setVerification(undefined);
    setRegistryContext(undefined);
    setIdentityState("observed");
    setAssignment(undefined);
    setGateway(undefined);
    setGatewaySurface(undefined);
    setRuntimeDecision(undefined);
    setInvocationEvidence(undefined);
    setScanning(false);
    setIssuing(false);
    setInvoking(false);
    setInvocationSequence(0);
    setError(undefined);
  };

  const resetDemo = (nextView: View = "overview") => {
    clearWorkflowState();
    setIntakeError(undefined);
    openView(nextView);
  };

  const selectFixture = (nextFixture: Exclude<AssessmentPreset, "custom">) => {
    if (nextFixture === fixtureKey) return;
    const nextManifest = structuredClone(nextFixture === "safe" ? safeManifest : riskyManifest);
    setFixtureKey(nextFixture);
    setManifest(nextManifest);
    setSchemaDraft(JSON.stringify(nextManifest.tools[0].inputSchema, null, 2));
    setSchemaError(undefined);
    setIntakeError(undefined);
    clearWorkflowState();
    openView("assessments");
  };

  const changeManifest = (nextManifest: ArtifactManifest) => {
    setManifest(nextManifest);
    setFixtureKey("custom");
    setIntakeError(undefined);
    clearWorkflowState();
  };

  const changeSchemaDraft = (value: string) => {
    setSchemaDraft(value);
    setFixtureKey("custom");
    setIntakeError(undefined);
    clearWorkflowState();
    try {
      const inputSchema = JSON.parse(value) as ArtifactManifest["tools"][number]["inputSchema"];
      setManifest((current) => ({
        ...current,
        tools: [{ ...current.tools[0], inputSchema }, ...current.tools.slice(1)],
      }));
      setSchemaError(undefined);
    } catch {
      setSchemaError("Enter a valid JSON object before running the assessment.");
    }
  };

  const runAssessment = async () => {
    let inputSchema: unknown;
    try {
      inputSchema = JSON.parse(schemaDraft);
      setSchemaError(undefined);
    } catch {
      setSchemaError("Enter a valid JSON object before running the assessment.");
      setIntakeError("The input schema is not valid JSON.");
      return;
    }

    const candidate = {
      ...manifest,
      tools: [{ ...manifest.tools[0], inputSchema }, ...manifest.tools.slice(1)],
    };
    const validated = artifactManifestSchema.safeParse(candidate);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      setIntakeError(`${issue.path.join(".") || "manifest"}: ${issue.message}`);
      return;
    }

    setManifest(validated.data);
    setIntakeError(undefined);
    setScanning(true);
    setError(undefined);
    setCredential(undefined);
    setVerification(undefined);
    setRegistryContext(undefined);
    setIdentityState("observed");
    setAssignment(undefined);
    setGateway(undefined);
    setGatewaySurface(undefined);
    setRuntimeDecision(undefined);
    setInvocationEvidence(undefined);
    try {
      const nextProvider = new LocalTrustProvider();
      const nextSubmission = await nextProvider.submitArtifact(validated.data);
      const nextReport = await nextProvider.assessArtifact(nextSubmission.artifactVersion.id);
      setProvider(nextProvider);
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
      const nextRegistryContext = seedDemoRegistry(provider, nextCredential);
      setCredential(nextCredential);
      setVerification(nextVerification);
      setRegistryContext(nextRegistryContext);
      openView("registry");
    } catch (caught) {
      setCredential(undefined);
      setVerification(undefined);
      setError(caught instanceof Error ? caught.message : "Tool Passport issuance failed.");
    } finally {
      setIssuing(false);
    }
  };

  const claimAndAssign = async () => {
    if (!registryContext || !credential) return;
    setError(undefined);
    try {
      let observation = provider.registry.transitionObservedAgent(registryContext.observedAgent.id, "correlated");
      setIdentityState(observation.state);
      observation = provider.registry.transitionObservedAgent(observation.id, "verified", registryContext.agentPassport.id);
      setIdentityState(observation.state);
      const nextAssignment = await provider.createAssignment({
        agentPassportId: registryContext.agentPassport.id,
        capabilityClaimId: registryContext.capabilityClaim.id,
        authorityGrantId: registryContext.authorityGrant.id,
        toolPassportId: credential.passport.id,
        toolContractId: registryContext.toolContract.id,
        request: registryContext.assignmentRequest,
      });
      observation = provider.registry.transitionObservedAgent(observation.id, "governed");
      setAssignment(nextAssignment);
      setIdentityState(observation.state);
      const nextGateway = new ConditionalWebMcpGateway(provider);
      const buildRequest = (toolInput: unknown): GatewayInvocationRequest => ({
        id: `invocation:browser:${Date.now()}`,
        assignmentId: nextAssignment.id,
        agentPassportId: registryContext.agentPassport.id,
        toolPassportId: credential.passport.id,
        action: credential.passport.toolName,
        resource: "catalog://approved/laptops",
        destination: credential.passport.destinations[0],
        dataClasses: credential.passport.dataClasses,
        sideEffects: ["read"],
        input: toolInput,
        purposeHint: "Compare approved catalog products",
      });
      setGateway(nextGateway);
      const nextGatewaySurface = nextGateway.sync({
        assignmentId: nextAssignment.id,
        name: credential.passport.toolName,
        description: manifest.tools[0].description,
        inputSchema: manifest.tools[0].inputSchema,
        buildRequest,
      });
      setGatewaySurface(nextGatewaySurface);
      openView("gateway");
    } catch (caught) {
      setAssignment(undefined);
      setError(caught instanceof Error ? caught.message : "Identity claim and assignment failed.");
    }
  };

  const invokeTool = async (semanticDrift = false) => {
    if (!gateway || !assignment || !registryContext || !credential) return;
    setInvoking(true);
    setInvocationSequence((current) => current + 1);
    setRuntimeDecision(undefined);
    setInvocationEvidence(undefined);
    setError(undefined);
    try {
      const request: GatewayInvocationRequest = {
        id: `invocation:demo:${semanticDrift ? "drift" : "aligned"}:${Date.now()}`,
        assignmentId: assignment.id,
        agentPassportId: registryContext.agentPassport.id,
        toolPassportId: credential.passport.id,
        action: credential.passport.toolName,
        resource: "catalog://approved/laptops",
        destination: credential.passport.destinations[0],
        dataClasses: credential.passport.dataClasses,
        sideEffects: ["read"],
        input: { query: "rugged laptop", maxPriceUsd: 2400 },
        purposeHint: semanticDrift ? "Purchase and checkout without principal approval" : "Compare approved catalog products",
      };
      const result = await gateway.invokeFallback(request);
      setRuntimeDecision(result.decision);
      setInvocationEvidence(result.evidenceCredential);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gateway invocation failed closed.");
    } finally {
      setInvoking(false);
    }
  };

  const revokeRuntimeTool = () => {
    if (!gateway || !assignment || !credential || !registryContext) return;
    provider.revokeToolPassport(credential.passport.id);
    setGatewaySurface(gateway.sync({
      assignmentId: assignment.id,
      name: credential.passport.toolName,
      description: manifest.tools[0].description,
      inputSchema: manifest.tools[0].inputSchema,
      buildRequest: (input) => ({
        id: `invocation:revoked:${Date.now()}`,
        assignmentId: assignment.id,
        agentPassportId: registryContext.agentPassport.id,
        toolPassportId: credential.passport.id,
        action: credential.passport.toolName,
        resource: "catalog://approved/laptops",
        destination: credential.passport.destinations[0],
        dataClasses: credential.passport.dataClasses,
        sideEffects: ["read"],
        input,
        purposeHint: "Compare approved catalog products",
      }),
    }));
  };

  const sortedFindings = useMemo(
    () => [...(report?.findings ?? [])].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [report],
  );
  const snapshot = provider.snapshot();
  const completedWorkflowSteps = invocationEvidence ? 5 : assignment ? 4 : credential ? 3 : report ? 2 : submission ? 1 : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <img src="/assets/flint-command-icon-blue.png" alt="" />
          </span>
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
              onClick={() => openView(item.id)}
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
            <h1>{VIEW_TITLE[view]}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone="demo">DEMO DATA</StatusPill>
            <button className="secondary-button reset-button" type="button" onClick={() => resetDemo()}>Reset demo</button>
            <button className="secondary-button" type="button" onClick={() => openView("evidence")}>View evidence</button>
          </div>
        </header>

        <section className="notice" aria-label="Community assurance notice">
          <span>COMMUNITY ASSURANCE</span>
          <p>Credentials issued here are locally self-attested. Their integrity is verifiable, but they are not a FLINT Stamp or FLINT-verified assurance.</p>
        </section>

        <div className="view-surface" key={view}>
        {view === "overview" ? (
          <>
        <CommunityFleetConstellation
          primaryName={registryContext?.agentPassport.displayName ?? "Procurement Analyst"}
          primaryTool={manifest.tools[0].name}
          primaryScope={manifest.tools[0].capabilities}
          primaryMandate={registryContext?.authorityGrant.purpose ?? "No active authority grant. Local declaration only."}
          lifecycleState={identityState}
          assignmentActive={Boolean(assignment)}
          verdict={runtimeDecision?.verdict}
          revoked={gatewaySurface?.eligibility === "ineligible"}
          invoking={invoking}
          invocationSequence={invocationSequence}
        />

        <section className="panel coverage-panel" aria-label="Agent discovery and governance coverage">
          <div>
            <p className="eyebrow">AGENT DISCOVERY & COVERAGE</p>
            <h2>Measured only on connected demo surfaces</h2>
            <p>One synthetic gateway event is in scope. Endpoint and API-direct activity are explicitly unobserved.</p>
          </div>
          <div className="coverage-metrics">
            <article>
              <span>Observed activity coverage</span>
              <strong>1 / 1</strong>
              <small>Gateway events on the instrumented demo surface</small>
            </article>
            <article>
              <span>Governed activity coverage</span>
              <strong>{identityState === "governed" ? "1 / 1" : "0 / 1"}</strong>
              <small>{identityState === "governed" ? "Passport and assignment current" : "No current governed identity yet"}</small>
            </article>
            <article>
              <span>Attribution state</span>
              <strong>{identityState === "observed" ? "SUSPECTED" : identityState.toUpperCase()}</strong>
              <small>Simulated evidence · confidence {registryContext?.observedAgent.confidence ?? 48}%</small>
            </article>
            <article>
              <span>Unobserved activity</span>
              <strong>NOT MEASURABLE</strong>
              <small>Never presented as “percent of all agents”</small>
            </article>
          </div>
          <div className="sensor-strip">
            <span><b>CONNECTED</b> WebMCP Gateway</span>
            <span><b>BLIND SPOT</b> Endpoint + API-direct telemetry</span>
            <span><b>CLASSIFICATION</b> Verified / Correlated / Suspected kept distinct</span>
          </div>
        </section>

        <section className="workflow-steps" aria-label="Tool assurance workflow">
          {["Submit exact version", "Assess evidence", "Issue community passport", "Assign through Gateway", "Emit signed evidence"].map((label, index) => (
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

          </>
        ) : null}

        {view === "assessments" ? (
        <section className="workspace-grid">
          <article className="panel assessment-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">PUBLISHER INTAKE</p>
                <h2>Submit an exact tool version</h2>
              </div>
              <StatusPill tone={report?.verdict?.toLowerCase() ?? "neutral"}>{scanning ? "ASSESSING" : report?.verdict ?? "READY"}</StatusPill>
            </div>

            <AssessmentIntakeForm
              manifest={manifest}
              preset={fixtureKey}
              schemaDraft={schemaDraft}
              schemaError={schemaError}
              disabled={scanning || issuing}
              onPresetChange={selectFixture}
              onManifestChange={changeManifest}
              onSchemaDraftChange={changeSchemaDraft}
            />

            <div className="assessment-engine-strip" aria-label="Assessment execution boundary">
              <span><b>ENGINE</b> Community Scanner</span>
              <span><b>MODE</b> Deterministic static</span>
              <span><b>EXECUTION</b> Submitted tools never run</span>
            </div>

            {submission && (
              <div className="intake-receipt">
                <span>Immutable version</span>
                <code>{submission.artifactVersion.id}</code>
                <small>{submission.artifactVersion.digest}</small>
              </div>
            )}

            {intakeError && <p className="error-message" role="alert">{intakeError}</p>}
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
        ) : null}

        {view === "registry" && credential && verification && (
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

        {view === "registry" && credential && registryContext && (
          <section className="panel registry-panel" aria-label="Identity and assignment registry">
            <div className="registry-heading">
              <div>
                <p className="eyebrow">IDENTITY REGISTRY</p>
                <h2>Resolve capability, authority, and exact-version assignment</h2>
              </div>
              <StatusPill tone={identityState === "governed" ? "pass" : "demo"}>{identityState.toUpperCase()}</StatusPill>
            </div>

            <div className="identity-lifecycle" aria-label="Observed Agent lifecycle">
              {(["observed", "correlated", "verified", "governed"] as const).map((state, index) => {
                const reached = ["observed", "correlated", "verified", "governed"].indexOf(identityState) >= index;
                return (
                  <div className={reached ? "identity-state reached" : "identity-state"} key={state}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{state}</strong>
                  </div>
                );
              })}
            </div>

            <div className="registry-intersection">
              <article>
                <span>CAN</span>
                <strong>Capability Claim v{registryContext.capabilityClaim.version}</strong>
                <p>{registryContext.capabilityClaim.capabilities[0].action} on approved catalog resources.</p>
              </article>
              <article>
                <span>MAY</span>
                <strong>Authority Grant v{registryContext.authorityGrant.version}</strong>
                <p>{registryContext.authorityGrant.purpose}</p>
              </article>
              <article>
                <span>TOOL</span>
                <strong>Semantic Contract v{registryContext.toolContract.version}</strong>
                <p>{credential.passport.artifactVersion} · {credential.passport.artifactDigest.slice(0, 27)}…</p>
              </article>
              <article>
                <span>MAY NOW</span>
                <strong>{assignment ? "Assignment active" : "No assignment"}</strong>
                <p>{assignment ? `${assignment.allowedActions.join(", ")} · ${assignment.resourcePatterns.join(", ")}` : "The tool is not exposed until the intersection is approved."}</p>
              </article>
            </div>

            <div className="coverage-disclosure">
              <span>Observation confidence: {registryContext.observedAgent.confidence}%</span>
              <span>Surfaces: {registryContext.observedAgent.instrumentedSurfaces.join(", ")}</span>
              <span>Blind spot: {registryContext.observedAgent.blindSpots[0]}</span>
            </div>

            <button className="primary-button registry-action" type="button" disabled={Boolean(assignment)} onClick={() => void claimAndAssign()}>
              {assignment ? "Agent governed · exact tool assigned" : "Claim agent & assign eligible tool"}
            </button>
          </section>
        )}

        {view === "registry" && (!credential || !verification || !registryContext) ? (
          <ViewEmptyState
            eyebrow="IDENTITY REGISTRY / AWAITING CREDENTIAL"
            title="Issue a Tool Passport before assigning authority"
            body="The registry keeps agent identity, capability, semantic authority, and exact tool version separate. Complete a passing assessment and issue the local credential to load this view."
            actionLabel="Open tool assessments"
            onAction={() => openView("assessments")}
          />
        ) : null}

        {view === "gateway" && assignment && gatewaySurface && (
          <section className="panel gateway-panel" aria-label="Conditional WebMCP Gateway">
            <div className="registry-heading">
              <div>
                <p className="eyebrow">CONDITIONAL WEBMCP GATEWAY</p>
                <h2>Expose only what this agent may use now</h2>
              </div>
              <StatusPill tone={gatewaySurface.eligibility === "registered" ? "pass" : "fail"}>
                {gatewaySurface.eligibility === "registered" ? (gatewaySurface.supported ? "WEBMCP LIVE" : "FALLBACK READY") : "REMOVED"}
              </StatusPill>
            </div>

            <div className="gateway-status-grid">
              <article><span>Browser surface</span><strong>{gatewaySurface.supported ? "document.modelContext" : "Visible fallback"}</strong></article>
              <article><span>Eligibility</span><strong>{gatewaySurface.eligibility.toUpperCase()}</strong></article>
              <article><span>Runtime rule</span><strong>Deterministic first</strong></article>
              <article><span>Semantic gate</span><strong>Escalation only</strong></article>
            </div>
            <p className="surface-disclosure">{gatewaySurface.detail}</p>

            <div className="gateway-actions">
              <button className="primary-button" type="button" disabled={invoking || gatewaySurface.eligibility !== "registered"} onClick={() => void invokeTool(false)}>
                {invoking ? "Evaluating…" : "Invoke eligible tool"}
              </button>
              <button className="secondary-button" type="button" disabled={invoking || gatewaySurface.eligibility !== "registered"} onClick={() => void invokeTool(true)}>
                Attempt semantic drift
              </button>
              <button className="danger-button" type="button" disabled={gatewaySurface.eligibility !== "registered"} onClick={revokeRuntimeTool}>
                Revoke Tool Passport
              </button>
            </div>

            {runtimeDecision && invocationEvidence && (
              <div className={`runtime-receipt verdict-${runtimeDecision.verdict.toLowerCase()}`}>
                <div>
                  <span>Gateway verdict</span>
                  <strong>{runtimeDecision.verdict}</strong>
                  <p>{runtimeDecision.reasonCodes.join(" · ")}</p>
                </div>
                <div>
                  <span>Signed invocation evidence</span>
                  <strong>{invocationEvidence.evidence.id}</strong>
                  <code>{invocationEvidence.proof.proofValue}</code>
                </div>
                <div>
                  <span>Version bindings</span>
                  <strong>Capability v{invocationEvidence.evidence.capabilityClaimVersion} · Authority v{invocationEvidence.evidence.semanticAuthorityGrantVersion} · Tool Contract v{invocationEvidence.evidence.toolSemanticContractVersion}</strong>
                  <code>{invocationEvidence.evidence.policyDigest}</code>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "gateway" && (!assignment || !gatewaySurface) ? (
          <ViewEmptyState
            eyebrow="MCP GATEWAY / AWAITING ASSIGNMENT"
            title="No eligible agent-tool intersection is active"
            body={credential ? "Resolve the agent's capability, authority, and exact-version assignment in the Identity Registry before exposing the tool." : "Assess the tool, issue its credential, and resolve an identity assignment before the gateway can expose it."}
            actionLabel={credential ? "Open identity registry" : "Open tool assessments"}
            onAction={() => openView(credential ? "registry" : "assessments")}
          />
        ) : null}

        {view === "gateway" ? (
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
        ) : null}

        {view === "evidence" && runtimeDecision && invocationEvidence ? (
          <section className={`panel evidence-log-panel verdict-${runtimeDecision.verdict.toLowerCase()}`} aria-label="Signed invocation evidence log">
            <div className="evidence-log-heading">
              <div>
                <p className="eyebrow">INVOCATION EVIDENCE CREDENTIAL</p>
                <h2>{invocationEvidence.evidence.id}</h2>
              </div>
              <StatusPill tone={runtimeDecision.verdict === "ALLOW" ? "pass" : "fail"}>{runtimeDecision.verdict}</StatusPill>
            </div>
            <div className="evidence-log-grid">
              <article><span>Occurred</span><strong>{new Date(invocationEvidence.evidence.occurredAt).toLocaleString()}</strong></article>
              <article><span>Outcome</span><strong>{invocationEvidence.evidence.outcome.toUpperCase()}</strong></article>
              <article><span>Agent identity</span><strong>{invocationEvidence.evidence.agentId}</strong></article>
              <article><span>Tool Passport</span><strong>{invocationEvidence.evidence.toolPassportId}</strong></article>
              <article><span>Action</span><strong>{invocationEvidence.evidence.action}</strong></article>
              <article><span>Resource</span><strong>{invocationEvidence.evidence.resource}</strong></article>
            </div>
            <div className="evidence-bindings">
              <div>
                <span>Decision reasons</span>
                <strong>{invocationEvidence.evidence.reasonCodes.join(" · ")}</strong>
              </div>
              <div>
                <span>Version bindings</span>
                <strong>Capability v{invocationEvidence.evidence.capabilityClaimVersion} · Authority v{invocationEvidence.evidence.semanticAuthorityGrantVersion} · Tool Contract v{invocationEvidence.evidence.toolSemanticContractVersion}</strong>
              </div>
              <div>
                <span>Policy digest</span>
                <code>{invocationEvidence.evidence.policyDigest}</code>
              </div>
              <div>
                <span>Data integrity proof</span>
                <code>{invocationEvidence.proof.proofValue}</code>
              </div>
            </div>
          </section>
        ) : null}

        {view === "evidence" && (!runtimeDecision || !invocationEvidence) ? (
          <ViewEmptyState
            eyebrow="EVIDENCE LOG / NO EVENTS"
            title="No signed invocation evidence has been emitted"
            body={assignment ? "Invoke the eligible tool or attempt semantic drift to create a signed gateway decision record." : "Complete the tool assessment, identity assignment, and gateway invocation to create the first signed record."}
            actionLabel={assignment ? "Open gateway policy" : credential ? "Open identity registry" : "Open tool assessments"}
            onAction={() => openView(assignment ? "gateway" : credential ? "registry" : "assessments")}
          />
        ) : null}
        </div>
      </main>
    </div>
  );
}

export default App;
