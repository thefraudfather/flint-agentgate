import { useEffect, useMemo, useState } from "react";
import type {
  AssessmentReport,
  AssignmentGrant,
  ArtifactManifest,
  AuthorityChangeProposal,
  Finding,
  GatewayDecision,
  InvocationEvidenceCredential,
  ObservedAgent,
  ToolPassportCredential,
} from "./domain/contracts";
import { artifactManifestSchema, semanticAuthorityGrantSchema } from "./domain/contracts";
import type { CommunityCredentialVerification } from "./credentials/communityIssuer";
import { LocalTrustProvider } from "./providers/localTrustProvider";
import type { SubmissionResult } from "./providers/trustProvider";
import {
  createDefaultRegistryDraft,
  registerRegistryDraft,
  type IdentityRegistryDraft,
  type RegistryContext,
} from "./registry/demoRegistry";
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
import { AgentGateGlossary, HowAgentGateWorks } from "./components/EvidenceGuide";
import { IdentityRegistryForm } from "./components/IdentityRegistryForm";
import { summarizeGatewayDecision } from "./gateway/decisionCopy";
import { intersectPatternScopes } from "./registry/assignmentPolicy";

type View = "overview" | "registry" | "assessments" | "gateway" | "evidence";
type EvidenceTab = "records" | "guide" | "glossary";
type EvidenceRecord = { decision: GatewayDecision; credential: InvocationEvidenceCredential };
type EvidenceTransferState = "idle" | "copied" | "error";

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "overview", label: "Overview", glyph: "01" },
  { id: "assessments", label: "Tool assessments", glyph: "02" },
  { id: "registry", label: "Identity registry", glyph: "03" },
  { id: "gateway", label: "Gateway policy", glyph: "04" },
  { id: "evidence", label: "Evidence + help", glyph: "05" },
];

const VIEW_TITLE: Record<View, string> = {
  overview: "From submitted tool to governed capability",
  registry: "Identity registry",
  assessments: "Tool assessments",
  gateway: "Test an agent's tool access",
  evidence: "Evidence center",
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

function formatValidationError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const issues = (error as Error & { issues?: Array<{ path?: PropertyKey[]; message?: string }> }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return error.message;
  return issues.map((issue) => `${issue.path?.join(".") || "Registry"}: ${issue.message || "Invalid value"}`).join(" ");
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
        <span>assessment score</span>
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
  const [registryDraft, setRegistryDraft] = useState<IdentityRegistryDraft>();
  const [registryContext, setRegistryContext] = useState<RegistryContext>();
  const [authorityChanges, setAuthorityChanges] = useState<AuthorityChangeProposal[]>([]);
  const [authorityRevision, setAuthorityRevision] = useState({ reason: "Reduce the agent blast radius.", purpose: "", roots: "", maxTransactionUsd: "" });
  const [registryError, setRegistryError] = useState<string>();
  const [registeringIdentity, setRegisteringIdentity] = useState(false);
  const [identityState, setIdentityState] = useState<ObservedAgent["state"]>("observed");
  const [assignment, setAssignment] = useState<AssignmentGrant>();
  const [gateway, setGateway] = useState<ConditionalWebMcpGateway>();
  const [gatewaySurface, setGatewaySurface] = useState<GatewaySurfaceState>();
  const [runtimeDecision, setRuntimeDecision] = useState<GatewayDecision>();
  const [invocationEvidence, setInvocationEvidence] = useState<InvocationEvidenceCredential>();
  const [evidenceHistory, setEvidenceHistory] = useState<EvidenceRecord[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>();
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>("records");
  const [evidenceTransferState, setEvidenceTransferState] = useState<EvidenceTransferState>("idle");
  const [invoking, setInvoking] = useState(false);
  const [invocationSequence, setInvocationSequence] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (view === "registry" && registryContext) {
      document.getElementById("resolved-identity")?.scrollIntoView({ block: "start" });
    }
  }, [registryContext, view]);

  const openView = (nextView: View) => {
    setView(nextView);
    window.requestAnimationFrame(() => window.scrollTo({ left: 0, top: 0 }));
  };

  const openEvidence = (tab?: EvidenceTab) => {
    setEvidenceTab(tab ?? (evidenceHistory.length > 0 ? "records" : "guide"));
    openView("evidence");
  };

  const clearWorkflowState = () => {
    gateway?.dispose();
    setProvider(new LocalTrustProvider());
    setSubmission(undefined);
    setReport(undefined);
    setCredential(undefined);
    setVerification(undefined);
    setRegistryDraft(undefined);
    setRegistryContext(undefined);
    setAuthorityChanges([]);
    setRegistryError(undefined);
    setRegisteringIdentity(false);
    setIdentityState("observed");
    setAssignment(undefined);
    setGateway(undefined);
    setGatewaySurface(undefined);
    setRuntimeDecision(undefined);
    setInvocationEvidence(undefined);
    setEvidenceHistory([]);
    setSelectedEvidenceId(undefined);
    setEvidenceTransferState("idle");
    setScanning(false);
    setIssuing(false);
    setInvoking(false);
    setInvocationSequence(0);
    setError(undefined);
  };

  const resetDemo = (nextView: View = "overview") => {
    const nextManifest = structuredClone(safeManifest);
    setFixtureKey("safe");
    setManifest(nextManifest);
    setSchemaDraft(JSON.stringify(nextManifest.tools[0].inputSchema, null, 2));
    setSchemaError(undefined);
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
    gateway?.dispose();
    setGateway(undefined);
    setGatewaySurface(undefined);
    setRuntimeDecision(undefined);
    setInvocationEvidence(undefined);
    setEvidenceHistory([]);
    setSelectedEvidenceId(undefined);
    setEvidenceTransferState("idle");
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
      setCredential(nextCredential);
      setVerification(nextVerification);
      setRegistryDraft(createDefaultRegistryDraft(nextCredential));
      setRegistryContext(undefined);
      setAuthorityChanges([]);
      setRegistryError(undefined);
      openView("registry");
    } catch (caught) {
      setCredential(undefined);
      setVerification(undefined);
      setError(caught instanceof Error ? caught.message : "Tool Passport issuance failed.");
    } finally {
      setIssuing(false);
    }
  };

  const registerIdentity = async () => {
    if (!credential || !registryDraft) return;
    setRegisteringIdentity(true);
    setRegistryError(undefined);
    setError(undefined);
    try {
      const nextRegistryContext = await registerRegistryDraft(provider, credential, registryDraft);
      setRegistryContext(nextRegistryContext);
      setAuthorityRevision({
        reason: "Reduce the agent blast radius.",
        purpose: nextRegistryContext.authorityGrant.purpose,
        roots: nextRegistryContext.authorityGrant.permittedRoots.join(", "),
        maxTransactionUsd: nextRegistryContext.authorityGrant.maxTransactionUsd?.toString() ?? "",
      });
      setIdentityState(nextRegistryContext.observedAgent.state);
    } catch (caught) {
      setRegistryContext(undefined);
      setRegistryError(formatValidationError(caught, "Identity registration failed closed."));
    } finally {
      setRegisteringIdentity(false);
    }
  };

  const proposeAuthorityRevision = () => {
    if (!registryContext) return;
    setRegistryError(undefined);
    try {
      const previous = registryContext.authorityGrant;
      const version = previous.version + 1;
      const baseId = `${previous.id.replace(/:v\d+(?::attempt-\d+)?$/, "")}:v${version}`;
      const attempt = authorityChanges.filter((change) => (
        change.proposedAuthorityGrantId === baseId || change.proposedAuthorityGrantId.startsWith(`${baseId}:attempt-`)
      )).length + 1;
      const roots = authorityRevision.roots.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
      const proposed = semanticAuthorityGrantSchema.parse({
        ...previous,
        id: attempt === 1 ? baseId : `${baseId}:attempt-${attempt}`,
        version,
        purpose: authorityRevision.purpose,
        allow: previous.allow.map((rule, index) => index === 0 ? { ...rule, resources: roots } : rule),
        permittedRoots: roots,
        maxTransactionUsd: authorityRevision.maxTransactionUsd === "" ? undefined : Number(authorityRevision.maxTransactionUsd),
        issuedAt: new Date().toISOString(),
      });
      provider.registry.proposeAuthorityChange({
        previousAuthorityGrantId: previous.id,
        proposedAuthorityGrant: proposed,
        requestedById: "operator:community-demo",
        reason: authorityRevision.reason,
      });
      setAuthorityChanges(provider.registry.snapshot().authorityChanges);
    } catch (caught) {
      setRegistryError(formatValidationError(caught, "Authority revision failed closed."));
    }
  };

  const decideAuthorityRevision = (change: AuthorityChangeProposal, approve: boolean) => {
    if (!registryContext) return;
    setRegistryError(undefined);
    try {
      if (approve) {
        provider.registry.approveAuthorityChange(change.id, registryContext.principal.id);
        const authorityGrant = provider.registry.authorityGrant(change.proposedAuthorityGrantId);
        setRegistryContext({
          ...registryContext,
          authorityGrant,
          assignmentRequest: {
            ...registryContext.assignmentRequest,
            resourcePatterns: intersectPatternScopes(
              registryContext.assignmentRequest.resourcePatterns,
              authorityGrant.permittedRoots,
            ),
          },
        });
        setAssignment(undefined);
        gateway?.dispose();
        setGateway(undefined);
        setGatewaySurface(undefined);
        setRuntimeDecision(undefined);
        setInvocationEvidence(undefined);
        setIdentityState("verified");
        setAuthorityRevision({
          reason: "Reduce the agent blast radius.",
          purpose: authorityGrant.purpose,
          roots: authorityGrant.permittedRoots.join(", "),
          maxTransactionUsd: authorityGrant.maxTransactionUsd?.toString() ?? "",
        });
      } else {
        provider.registry.rejectAuthorityChange(change.id, registryContext.principal.id);
      }
      setAuthorityChanges(provider.registry.snapshot().authorityChanges);
    } catch (caught) {
      setRegistryError(formatValidationError(caught, "Authority decision failed closed."));
    }
  };

  const claimAndAssign = async () => {
    if (!registryContext || !credential) return;
    setError(undefined);
    try {
      let observation = provider.registry.snapshot().observedAgents.find(({ id }) => id === registryContext.observedAgent.id);
      if (!observation) throw new Error("Observed Agent is not registered.");
      if (observation.state === "observed") {
        observation = provider.registry.transitionObservedAgent(observation.id, "correlated");
        setIdentityState(observation.state);
      }
      if (observation.state === "correlated") {
        observation = provider.registry.transitionObservedAgent(observation.id, "verified", registryContext.agentPassport.id);
        setIdentityState(observation.state);
      }
      const nextAssignment = await provider.createAssignment({
        agentPassportId: registryContext.agentPassport.id,
        capabilityClaimId: registryContext.capabilityClaim.id,
        authorityGrantId: registryContext.authorityGrant.id,
        toolPassportId: credential.passport.id,
        toolContractId: registryContext.toolContract.id,
        request: registryContext.assignmentRequest,
      });
      if (observation.state === "verified") {
        observation = provider.registry.transitionObservedAgent(observation.id, "governed");
      }
      setAssignment(nextAssignment);
      setIdentityState("governed");
      const nextGateway = new ConditionalWebMcpGateway(provider);
      const resource = registryContext.assignmentRequest.resourcePatterns[0]?.endsWith("*")
        ? `${registryContext.assignmentRequest.resourcePatterns[0].slice(0, -1)}demo-item`
        : registryContext.assignmentRequest.resourcePatterns[0] ?? "";
      const buildRequest = (toolInput: unknown): GatewayInvocationRequest => ({
        id: `invocation:browser:${Date.now()}`,
        assignmentId: nextAssignment.id,
        agentPassportId: registryContext.agentPassport.id,
        toolPassportId: credential.passport.id,
        action: credential.passport.toolName,
        resource,
        destination: registryContext.assignmentRequest.destinations[0] ?? "",
        dataClasses: registryContext.assignmentRequest.dataClasses,
        sideEffects: registryContext.assignmentRequest.sideEffects,
        input: toolInput,
        purposeHint: registryContext.authorityGrant.purpose,
      });
      gateway?.dispose();
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
    setEvidenceTransferState("idle");
    setError(undefined);
    try {
      const resource = assignment.resourcePatterns[0]?.endsWith("*")
        ? `${assignment.resourcePatterns[0].slice(0, -1)}demo-item`
        : assignment.resourcePatterns[0] ?? "";
      const request: GatewayInvocationRequest = {
        id: `invocation:demo:${semanticDrift ? "drift" : "aligned"}:${Date.now()}`,
        assignmentId: assignment.id,
        agentPassportId: registryContext.agentPassport.id,
        toolPassportId: credential.passport.id,
        action: credential.passport.toolName,
        resource,
        destination: assignment.destinations[0] ?? "",
        dataClasses: assignment.dataClasses,
        sideEffects: assignment.sideEffects,
        input: { query: "rugged laptop", maxPriceUsd: 2400 },
        purposeHint: semanticDrift ? "Purchase and checkout without principal approval" : registryContext.authorityGrant.purpose,
      };
      const result = await gateway.invokeFallback(request);
      setRuntimeDecision(result.decision);
      setInvocationEvidence(result.evidenceCredential);
      setEvidenceHistory((current) => [...current, { decision: result.decision, credential: result.evidenceCredential }]);
      setSelectedEvidenceId(result.evidenceCredential.evidence.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gateway invocation failed closed.");
    } finally {
      setInvoking(false);
    }
  };

  const revokeRuntimeTool = () => {
    if (!gateway || !assignment || !credential || !registryContext) return;
    provider.revokeToolPassport(credential.passport.id);
    const resource = assignment.resourcePatterns[0]?.endsWith("*")
      ? `${assignment.resourcePatterns[0].slice(0, -1)}demo-item`
      : assignment.resourcePatterns[0] ?? "";
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
        resource,
        destination: assignment.destinations[0] ?? "",
        dataClasses: assignment.dataClasses,
        sideEffects: assignment.sideEffects,
        input,
        purposeHint: registryContext.authorityGrant.purpose,
      }),
    }));
  };

  const sortedFindings = useMemo(
    () => [...(report?.findings ?? [])].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [report],
  );
  const selectedEvidenceRecord = useMemo(
    () => evidenceHistory.find((record) => record.credential.evidence.id === selectedEvidenceId) ?? evidenceHistory.at(-1),
    [evidenceHistory, selectedEvidenceId],
  );
  const copySelectedEvidence = async () => {
    if (!selectedEvidenceRecord) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedEvidenceRecord.credential, null, 2));
      setEvidenceTransferState("copied");
    } catch {
      setEvidenceTransferState("error");
    }
  };
  const downloadSelectedEvidence = () => {
    if (!selectedEvidenceRecord) return;
    const json = JSON.stringify(selectedEvidenceRecord.credential, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedEvidenceRecord.credential.evidence.id.replace(/[^a-zA-Z0-9_.-]+/g, "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const snapshot = provider.snapshot();
  const completedWorkflowSteps = evidenceHistory.length > 0 ? 5 : assignment ? 4 : credential ? 3 : report ? 2 : submission ? 1 : 0;
  const governedActivityCurrent = identityState === "governed"
    && Boolean(assignment)
    && gatewaySurface?.eligibility === "registered";

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
              onClick={() => item.id === "evidence" ? openEvidence() : openView(item.id)}
            >
              <span>{item.glyph}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="system-state">
          <span className="live-dot" />
          <div>
            <strong>Demo engine ready</strong>
            <span>No FLINT account required</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">LOCAL COMMUNITY DEMO / {view.toUpperCase()}</p>
            <h1>{VIEW_TITLE[view]}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone="demo">DEMO DATA</StatusPill>
            <button className="secondary-button reset-button" type="button" onClick={() => resetDemo()}>Reset demo</button>
            <button className="secondary-button" type="button" onClick={() => openEvidence()}>Help &amp; evidence</button>
          </div>
        </header>

        <section className="notice" aria-label="Community demo limit">
          <span>DEMO LIMIT</span>
          <p>This browser creates its own signed records. A signature can reveal changes, but it is not a FLINT Stamp and does not mean FLINT verified the agent or tool.</p>
        </section>

        {error ? <p className="error-message operational-error" role="alert">{error}</p> : null}

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
          verdict={gatewaySurface?.eligibility === "ineligible" ? undefined : runtimeDecision?.verdict}
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
              <strong>{governedActivityCurrent ? "1 / 1" : "0 / 1"}</strong>
              <small>{governedActivityCurrent ? "Passport and assignment current" : gatewaySurface?.eligibility === "ineligible" ? "Tool access removed" : "No current governed identity yet"}</small>
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

        <section className="panel overview-start" aria-label="Start the guided safe path">
          <div>
            <p className="eyebrow">GUIDED SAFE PATH</p>
            <h2>Start with a tool that passes the bounded assessment</h2>
            <p>Load the safe example, then follow each enabled action through identity, assignment, invocation, and signed evidence.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => resetDemo("assessments")}>Start guided safe path</button>
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
              <span><b>SCANNER</b> Community</span>
              <span><b>METHOD</b> Rule-based review</span>
              <span><b>SAFETY</b> Submitted tools never run</span>
            </div>

            {submission && (
              <div className="intake-receipt">
                <span>Saved exact version</span>
                <code>{submission.artifactVersion.id}</code>
                <small>{submission.artifactVersion.digest}</small>
              </div>
            )}

            {intakeError && <p className="error-message" role="alert">{intakeError}</p>}
            <button className="primary-button" type="button" disabled={scanning || issuing} onClick={() => void runAssessment()}>
              {scanning ? "Submitting and assessing…" : report ? "Reassess this exact version" : "Assess this tool version"}
            </button>
          </article>

          <article className="panel result-panel" aria-live="polite">
            <div className="result-heading">
              <ScoreRing report={report} />
              <div>
                <p className="eyebrow">TOOL ASSESSMENT RESULT</p>
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
                <span>Scanner</span>
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
              ) : sortedFindings.map((finding) => (
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
              onClick={() => credential ? openView("registry") : void issuePassport()}
            >
              {issuing ? "Signing community credential…" : credential ? "Continue to Identity Registry" : "Issue community Tool Passport"}
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
              <a href="https://flint.network/command" target="_blank" rel="noreferrer">Explore FLINT Command</a>
            </div>
          </section>
        )}

        {view === "registry" && credential && verification && registryDraft && (
          <section className="panel registry-builder-panel" aria-label="Identity Registry intake">
            <div className="registry-heading">
              <div>
                <p className="eyebrow">IDENTITY REGISTRY</p>
                <h2>Bind identity, capability, and semantic authority</h2>
              </div>
              <StatusPill tone={registryContext ? "pass" : "demo"}>{registryContext ? "RECORDS ACTIVE" : "DRAFT"}</StatusPill>
            </div>

            {!registryContext ? (
              <aside className="registry-novice-cue" aria-label="Guided registry instructions">
                <strong>Prefilled registry draft</strong>
                <span>The Safe example values are ready for the guided path. For a custom tool, review every binding. Then select Register identity and semantic authority at the end of this form.</span>
              </aside>
            ) : null}

            <IdentityRegistryForm
              credential={credential}
              draft={registryDraft}
              disabled={registeringIdentity || Boolean(registryContext)}
              onChange={(nextDraft) => {
                setRegistryDraft(nextDraft);
                setRegistryError(undefined);
              }}
            />

            {registryError ? <p className="error-message registry-error" role="alert">{registryError}</p> : null}

            {!registryContext ? (
              <button className="primary-button registry-action" type="button" disabled={registeringIdentity} onClick={() => void registerIdentity()}>
                {registeringIdentity ? "Validating semantic intersection…" : "Register identity and semantic authority"}
              </button>
            ) : (
              <div className="registry-lock-notice" role="status">
                <strong>Registry records committed</strong>
                <span>Identity records are locked for this demo session. Reset to register a different agent.</span>
              </div>
            )}
          </section>
        )}

        {view === "registry" && credential && registryContext && (
          <section className="panel registry-panel" id="resolved-identity" aria-label="Identity and assignment resolution">
            <div className="registry-heading">
              <div>
                <p className="eyebrow">RESOLVED IDENTITY</p>
                <h2>{registryContext.agentPassport.displayName}</h2>
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
                <p>{registryContext.capabilityClaim.capabilities[0].action} on {registryContext.capabilityClaim.capabilities[0].resources.join(", ")}.</p>
              </article>
              <article>
                <span>MAY</span>
                <strong>Authority Grant v{registryContext.authorityGrant.version}</strong>
                <p>{registryContext.authorityGrant.purpose}</p>
              </article>
              <article>
                <span>TOOL</span>
                <strong>Semantic Contract v{registryContext.toolContract.version}</strong>
                <p>{credential.passport.artifactVersion} / {credential.passport.artifactDigest.slice(0, 27)}...</p>
              </article>
              <article>
                <span>MAY NOW</span>
                <strong>{assignment ? "Assignment active" : "No assignment"}</strong>
                <p>{assignment ? `${assignment.allowedActions.join(", ")} / ${assignment.resourcePatterns.join(", ")}` : "The tool is not exposed until the intersection is approved."}</p>
              </article>
            </div>

            <div className="coverage-disclosure">
              <span>Observation confidence: {registryContext.observedAgent.confidence}%</span>
              <span>Surfaces: {registryContext.observedAgent.instrumentedSurfaces.join(", ")}</span>
              <span>Blind spot: {registryContext.observedAgent.blindSpots[0]}</span>
            </div>

            <button className="primary-button registry-action" type="button" disabled={Boolean(assignment)} onClick={() => void claimAndAssign()}>
              {assignment ? "Agent governed / exact tool assigned" : "Claim agent and assign eligible tool"}
            </button>
          </section>
        )}

        {view === "registry" && registryContext && (
          <section className="panel authority-change-panel" aria-label="Authority revision ledger">
            <div className="registry-heading">
              <div>
                <p className="eyebrow">VERSIONED AUTHORITY</p>
                <h2>Propose, classify, and approve mandate changes</h2>
              </div>
              <StatusPill tone={authorityChanges.some((change) => change.status === "pending") ? "conditional" : "pass"}>
                {authorityChanges.some((change) => change.status === "pending") ? "APPROVAL PENDING" : `ACTIVE V${registryContext.authorityGrant.version}`}
              </StatusPill>
            </div>

            <div className="authority-change-layout">
              <fieldset disabled={authorityChanges.some((change) => change.status === "pending")}>
                <label><span>Change reason</span><input value={authorityRevision.reason} onChange={(event) => setAuthorityRevision({ ...authorityRevision, reason: event.target.value })} /></label>
                <label><span>Purpose and mandate</span><textarea rows={3} value={authorityRevision.purpose} onChange={(event) => setAuthorityRevision({ ...authorityRevision, purpose: event.target.value })} /></label>
                <label><span>Permitted roots</span><input value={authorityRevision.roots} onChange={(event) => setAuthorityRevision({ ...authorityRevision, roots: event.target.value })} /><small>Use exact paths or a trailing * wildcard, separated by commas.</small></label>
                <label><span>Transaction ceiling, USD</span><input type="number" min="0" placeholder="Not applicable" value={authorityRevision.maxTransactionUsd} onChange={(event) => setAuthorityRevision({ ...authorityRevision, maxTransactionUsd: event.target.value })} /><small>Optional. Enforced when an invocation includes transactionUsd.</small></label>
                <button className="secondary-button" type="button" onClick={proposeAuthorityRevision}>Propose authority v{registryContext.authorityGrant.version + 1}</button>
              </fieldset>

              <div className="authority-ledger" aria-live="polite">
                <article className="authority-ledger-entry active">
                  <span>ACTIVE</span>
                  <strong>Authority Grant v{registryContext.authorityGrant.version}</strong>
                  <p>{registryContext.authorityGrant.purpose}</p>
                </article>
                {[...authorityChanges].reverse().map((change) => (
                  <article className={`authority-ledger-entry ${change.status}`} key={change.id}>
                    <span>{change.status.toUpperCase()} · {change.classification.toUpperCase()}</span>
                    <strong>{change.previousAuthorityGrantId} → {change.proposedAuthorityGrantId}</strong>
                    <p>{change.reason}</p>
                    {change.status === "pending" ? (
                      <div>
                        <button className="primary-button" type="button" onClick={() => decideAuthorityRevision(change, true)}>Approve revision</button>
                        <button className="danger-button" type="button" onClick={() => decideAuthorityRevision(change, false)}>Reject</button>
                      </div>
                    ) : <small>Decision recorded by {change.decidedById}</small>}
                  </article>
                ))}
                {authorityChanges.length === 0 ? <p className="authority-ledger-empty">No revisions yet. The active grant remains the authority of record.</p> : null}
              </div>
            </div>
          </section>
        )}

        {view === "registry" && (!credential || !verification || !registryDraft) ? (
          <ViewEmptyState
            eyebrow="IDENTITY REGISTRY / AWAITING CREDENTIAL"
            title="Issue a Tool Passport before assigning authority"
            body="The registry keeps agent identity, capability, semantic authority, and exact tool version separate. Complete a passing assessment and issue the local credential to load this view."
            actionLabel="Open tool assessments"
            onAction={() => openView("assessments")}
          />
        ) : null}

        {view === "gateway" && assignment && gatewaySurface && (
          <section className="panel gateway-panel" aria-label="AgentGate request check">
            <div className="registry-heading">
              <div>
                <p className="eyebrow">LIVE POLICY TEST</p>
                <h2>Check each request before the tool runs</h2>
                <p className="gateway-intro">AgentGate compares the request with the current agent identity, approved tool version, active assignment, and principal mandate. A missing, revoked, expired, or out-of-scope requirement stops the request.</p>
              </div>
              <StatusPill tone={gatewaySurface.eligibility === "registered" ? "pass" : "fail"}>
                {gatewaySurface.eligibility === "registered" ? "DEMO READY" : "ACCESS REMOVED"}
              </StatusPill>
            </div>

            <div className="gateway-status-grid">
              <article><span>Tool surface</span><strong>{gatewaySurface.supported ? "Native WebMCP" : "Browser demo"}</strong></article>
              <article><span>Available to agent</span><strong>{gatewaySurface.eligibility === "registered" ? "YES" : "NO"}</strong></article>
              <article><span>Exact scope checks</span><strong>RUN FIRST</strong></article>
              <article><span>Purpose check</span><strong>RUNS SECOND</strong></article>
            </div>
            <p className="surface-disclosure">{gatewaySurface.supported
              ? "This browser exposes the tool through native WebMCP. The buttons below send operator test requests through the same AgentGate policy path."
              : "This browser cannot expose the tool through native WebMCP. The buttons below send operator test requests through AgentGate's policy path."}</p>
            {gatewaySurface.eligibility === "ineligible" ? (
              <p className="surface-removal-reason" role="status"><strong>Access removed:</strong> {gatewaySurface.detail}</p>
            ) : null}

            <div className="gateway-actions">
              <button className="primary-button" type="button" disabled={invoking || gatewaySurface.eligibility !== "registered"} onClick={() => void invokeTool(false)}>
                {invoking ? "Checking request…" : "Run allowed request"}
              </button>
              <button className="secondary-button" type="button" disabled={invoking || gatewaySurface.eligibility !== "registered"} onClick={() => void invokeTool(true)}>
                Run out-of-mandate request
              </button>
              <button className="danger-button" type="button" disabled={gatewaySurface.eligibility !== "registered"} onClick={revokeRuntimeTool}>
                Revoke tool access
              </button>
            </div>
            <p className="gateway-action-help">The first test should be allowed. The second changes the stated purpose and should be blocked. Revoking access removes the tool until you reset the demo.</p>

            {runtimeDecision && invocationEvidence && (
              <div className={`runtime-receipt verdict-${runtimeDecision.verdict.toLowerCase()}`}>
                <div>
                  <span>{gatewaySurface.eligibility === "registered" ? "Decision" : "Last decision before revocation"}</span>
                  <strong>{runtimeDecision.verdict}</strong>
                  <p>{summarizeGatewayDecision(runtimeDecision)}</p>
                  <details>
                    <summary>Show technical reason codes</summary>
                    <code>{runtimeDecision.reasonCodes.join(" · ")}</code>
                  </details>
                </div>
                <div>
                  <span>Signed evidence record</span>
                  <strong>{invocationEvidence.evidence.id}</strong>
                  <button className="secondary-button inline-action" type="button" onClick={() => openEvidence("records")}>View signed evidence</button>
                </div>
                <div>
                  <span>Policy versions checked</span>
                  <strong>Agent ability v{invocationEvidence.evidence.capabilityClaimVersion} · Owner authority v{invocationEvidence.evidence.semanticAuthorityGrantVersion} · Tool rules v{invocationEvidence.evidence.toolSemanticContractVersion}</strong>
                  <details>
                    <summary>Show policy fingerprint</summary>
                    <code>{invocationEvidence.evidence.policyDigest}</code>
                  </details>
                </div>
              </div>
            )}
            <p className="gateway-boundary">Community uses a bounded local purpose check. It records free-form Conditions but does not interpret them at runtime.</p>
          </section>
        )}

        {view === "gateway" && (!assignment || !gatewaySurface) ? (
          <ViewEmptyState
            eyebrow="GATEWAY / WAITING FOR SETUP"
            title="No tool is ready for this agent yet"
            body={credential ? "Finish the Identity Registry to connect the agent, principal's authority, and approved tool version." : "Assess a tool, issue its local credential, and connect it to an agent before testing access."}
            actionLabel={credential ? "Open identity registry" : "Open tool assessments"}
            onAction={() => openView(credential ? "registry" : "assessments")}
          />
        ) : null}

        {view === "gateway" ? (
        <section className="panel policy-strip">
          <div>
            <p className="eyebrow">WHY ACCESS IS ALLOWED OR BLOCKED</p>
            <h2>Every request must pass all four checks</h2>
            <small>Technical model: Identity ∩ Passport ∩ Assignment ∩ Context</small>
          </div>
          <div className="policy-flow" aria-label="Gateway policy sequence">
            <span>Known agent</span><b>→</b><span>Approved limits</span><b>→</b><span>Approved tool version</span><b>→</b><span>Current request</span>
          </div>
          <StatusPill tone="pass">DENY IF ANY CHECK FAILS</StatusPill>
        </section>
        ) : null}

        {view === "evidence" ? (
          <>
            <div className="evidence-tabs" aria-label="Evidence center sections">
              {([
                ["records", "Records"],
                ["guide", "How it works"],
                ["glossary", "Glossary"],
              ] as const).map(([tab, label]) => (
                <button
                  id={`evidence-tab-${tab}`}
                  className={evidenceTab === tab ? "active" : ""}
                  type="button"
                  aria-pressed={evidenceTab === tab}
                  key={tab}
                  onClick={() => setEvidenceTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {evidenceTab === "guide" ? (
              <div id="evidence-panel-guide">
                <HowAgentGateWorks onStart={() => resetDemo("assessments")} />
              </div>
            ) : null}

            {evidenceTab === "glossary" ? (
              <div id="evidence-panel-glossary">
                <AgentGateGlossary />
              </div>
            ) : null}

            {evidenceTab === "records" && selectedEvidenceRecord ? (
              <div className="evidence-workspace" id="evidence-panel-records">
                <aside className="panel evidence-history" aria-label="Session evidence records">
                  <div className="evidence-history-heading">
                    <p className="eyebrow">THIS BROWSER SESSION</p>
                    <h2>Gateway decisions</h2>
                    <p>Resetting or closing this demo clears the list.</p>
                  </div>
                  <div className="evidence-history-list">
                    {[...evidenceHistory].reverse().map((record) => (
                      <button
                        type="button"
                        className={record.credential.evidence.id === selectedEvidenceRecord.credential.evidence.id ? "active" : ""}
                        aria-pressed={record.credential.evidence.id === selectedEvidenceRecord.credential.evidence.id}
                        key={record.credential.evidence.id}
                        onClick={() => {
                          setSelectedEvidenceId(record.credential.evidence.id);
                          setEvidenceTransferState("idle");
                        }}
                      >
                        <span className={`history-verdict verdict-${record.decision.verdict.toLowerCase()}`}>{record.decision.verdict}</span>
                        <strong>{record.credential.evidence.action}</strong>
                        <small>{new Date(record.credential.evidence.occurredAt).toLocaleTimeString()} · {record.credential.evidence.resource}</small>
                      </button>
                    ))}
                  </div>
                </aside>

                <section className={`panel evidence-log-panel verdict-${selectedEvidenceRecord.decision.verdict.toLowerCase()}`} aria-label="Signed gateway evidence record">
                  <div className="evidence-log-heading">
                    <div>
                      <p className="eyebrow">SIGNED GATEWAY RECORD</p>
                      <h2>{selectedEvidenceRecord.decision.verdict === "ALLOW" ? "Allowed" : "Blocked"}: {selectedEvidenceRecord.credential.evidence.action}</h2>
                      <code>{selectedEvidenceRecord.credential.evidence.id}</code>
                    </div>
                    <StatusPill tone={selectedEvidenceRecord.decision.verdict === "ALLOW" ? "pass" : "fail"}>{selectedEvidenceRecord.decision.verdict}</StatusPill>
                  </div>
                  <div className="evidence-actions">
                    <button className="secondary-button" type="button" aria-label="Copy signed evidence as JSON" onClick={() => void copySelectedEvidence()}>
                      <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="7" y="7" width="9" height="9" /><path d="M13 4H4v9" /></svg>
                      Copy credential JSON
                    </button>
                    <button className="secondary-button" type="button" onClick={downloadSelectedEvidence}>
                      <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3v9m0 0 4-4m-4 4-4-4M4 16h12" /></svg>
                      Download JSON
                    </button>
                    <span className={`evidence-transfer-state ${evidenceTransferState}`} role="status" aria-live="polite">
                      {evidenceTransferState === "copied" ? "Credential JSON copied" : evidenceTransferState === "error" ? "Could not copy it. Download the JSON instead." : ""}
                    </span>
                  </div>
                  <p className="evidence-explainer">This signed JSON records what the agent requested, what AgentGate checked, and why it allowed or blocked the request. The local signature can reveal later changes, but it is not a FLINT Stamp.</p>
                  <div className="evidence-log-grid">
                    <article><span>Time</span><strong>{new Date(selectedEvidenceRecord.credential.evidence.occurredAt).toLocaleString()}</strong></article>
                    <article><span>Decision</span><strong>{selectedEvidenceRecord.credential.evidence.outcome.toUpperCase()}</strong></article>
                    <article><span>Agent</span><strong>{selectedEvidenceRecord.credential.evidence.agentId}</strong></article>
                    <article><span>Tool credential</span><strong>{selectedEvidenceRecord.credential.evidence.toolPassportId}</strong></article>
                    <article><span>Requested action</span><strong>{selectedEvidenceRecord.credential.evidence.action}</strong></article>
                    <article><span>Requested resource</span><strong>{selectedEvidenceRecord.credential.evidence.resource}</strong></article>
                  </div>
                  <div className="evidence-bindings">
                    <div>
                      <span>Why AgentGate decided</span>
                      <strong>{summarizeGatewayDecision(selectedEvidenceRecord.decision)}</strong>
                    </div>
                    <details>
                      <summary>Show technical reason codes</summary>
                      <code>{selectedEvidenceRecord.credential.evidence.reasonCodes.join(" · ")}</code>
                    </details>
                    <div>
                      <span>Policy versions checked</span>
                      <strong>Agent ability v{selectedEvidenceRecord.credential.evidence.capabilityClaimVersion} · Owner authority v{selectedEvidenceRecord.credential.evidence.semanticAuthorityGrantVersion} · Tool rules v{selectedEvidenceRecord.credential.evidence.toolSemanticContractVersion}</strong>
                    </div>
                    <details>
                      <summary>Show policy fingerprint</summary>
                      <code>{selectedEvidenceRecord.credential.evidence.policyDigest}</code>
                      <small>This fingerprint identifies the exact policy records used for the decision.</small>
                    </details>
                    <details>
                      <summary>Show local signature</summary>
                      <code>{selectedEvidenceRecord.credential.proof.proofValue}</code>
                      <small>The signature can reveal a changed record. It does not prove the submitted facts are true.</small>
                    </details>
                  </div>
                </section>
              </div>
            ) : null}

            {evidenceTab === "records" && !selectedEvidenceRecord ? (
              <div id="evidence-panel-records">
                <ViewEmptyState
                  eyebrow="EVIDENCE / NO DECISIONS"
                  title="No gateway decisions yet"
                  body={assignment ? "Run an allowed or out-of-mandate request to create signed JSON you can copy or download here." : "Complete the tool assessment and Identity Registry, then test a gateway request. Each decision creates signed JSON you can copy or download here."}
                  actionLabel={assignment ? "Test agent access" : credential ? "Open identity registry" : "Open tool assessments"}
                  onAction={() => openView(assignment ? "gateway" : credential ? "registry" : "assessments")}
                />
              </div>
            ) : null}
          </>
        ) : null}
        </div>
      </main>
    </div>
  );
}

export default App;
