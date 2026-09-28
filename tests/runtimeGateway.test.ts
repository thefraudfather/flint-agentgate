import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { verifyCommunityInvocationEvidence } from "../src/credentials/communityIssuer";
import {
  evaluateResolvedInvocation,
  type GatewayInvocationRequest,
  type SemanticIntegrityProvider,
} from "../src/gateway/runtimeGateway";
import { LocalTrustProvider } from "../src/providers/localTrustProvider";
import { createDefaultRegistryDraft, registerRegistryDraft, seedDemoRegistry } from "../src/registry/demoRegistry";
import { safeManifest } from "../src/scanner/fixtures";
import {
  ConditionalWebMcpGateway,
  registerNativeWebMcpTool,
  type WebMcpToolDefinition,
} from "../src/webmcp/conditionalGateway";

const now = "2026-08-30T12:00:00.000Z";

beforeEach((context) => {
  assert("mock" in context);
  context.mock.timers.enable({ apis: ["Date"], now: new Date(now) });
});

async function setup() {
  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(safeManifest, { now });
  await provider.assessArtifact(submission.artifactVersion.id, { now });
  const credential = await provider.issueToolPassport(submission.artifactVersion.id, "catalog.lookup", { now });
  const context = seedDemoRegistry(provider, credential);
  const assignment = await provider.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: context.authorityGrant.id,
    toolPassportId: credential.passport.id,
    toolContractId: context.toolContract.id,
    request: context.assignmentRequest,
    now,
  });
  const request: GatewayInvocationRequest = {
    id: "invocation:catalog:001",
    assignmentId: assignment.id,
    agentPassportId: context.agentPassport.id,
    toolPassportId: credential.passport.id,
    action: "catalog.lookup",
    resource: "catalog://approved/laptops",
    destination: "catalog.northstar.example",
    dataClasses: ["public"],
    sideEffects: ["read"],
    input: { query: "rugged laptop" },
    purposeHint: "Compare approved catalog products",
  };
  return { provider, context, assignment, credential, request };
}

test("eligible invocation is allowed and emits signed exact-version evidence", async () => {
  const context = await setup();
  const result = await context.provider.evaluateInvocation(context.request, { now });
  const verification = await verifyCommunityInvocationEvidence(result.evidenceCredential);

  assert.equal(result.decision.verdict, "ALLOW");
  assert.equal(result.evidenceCredential.evidence.capabilityClaimVersion, 1);
  assert.equal(result.evidenceCredential.evidence.semanticAuthorityGrantVersion, 1);
  assert.equal(result.evidenceCredential.evidence.toolSemanticContractVersion, 1);
  assert.equal(result.evidenceCredential.evidence.artifactDigest, context.credential.passport.artifactDigest);
  assert.equal(verification.integrityValid, true);
});

test("treats empty assignment, contract, and authority constraints as unconstrained", async () => {
  const context = await setup();
  const resolved = structuredClone(context.provider.resolveAssignment(context.assignment.id, { now }));
  resolved.assignment.resourcePatterns = [];
  resolved.assignment.dataClasses = [];
  resolved.assignment.destinations = [];
  resolved.assignment.sideEffects = [];
  resolved.toolContract.resources = [];
  resolved.toolContract.dataClasses = [];
  resolved.toolContract.destinations = [];
  resolved.toolContract.sideEffects = [];
  resolved.authorityGrant.allow[0].resources = [];
  resolved.authorityGrant.allow[0].dataClasses = [];
  resolved.authorityGrant.allow[0].destinations = [];
  resolved.authorityGrant.permittedRoots = [];
  resolved.authorityGrant.permittedSideEffects = [];

  const result = await evaluateResolvedInvocation({
    now,
    resolved,
    request: {
      ...context.request,
      id: "invocation:unconstrained",
      resource: "local://arbitrary/resource",
      destination: "unlisted.example",
      dataClasses: ["confidential"],
      sideEffects: ["write"],
    },
  });

  assert.equal(result.decision.verdict, "ALLOW");
});

test("enforces the principal's transaction ceiling when an amount is supplied", async () => {
  const context = await setup();
  const resolved = structuredClone(context.provider.resolveAssignment(context.assignment.id, { now }));
  resolved.authorityGrant.maxTransactionUsd = 100;

  const atLimit = await evaluateResolvedInvocation({
    now,
    resolved,
    request: { ...context.request, id: "invocation:at-limit", transactionUsd: 100 },
  });
  const overLimit = await evaluateResolvedInvocation({
    now,
    resolved,
    request: { ...context.request, id: "invocation:over-limit", transactionUsd: 100.01 },
  });

  assert.equal(atLimit.decision.verdict, "ALLOW");
  assert.equal(overLimit.decision.verdict, "BLOCK");
  assert(overLimit.decision.reasonCodes.includes("TRANSACTION_LIMIT_EXCEEDED"));
});

test("rejects invalid supplied USD amounts without rejecting absent read-only amounts", async () => {
  const context = await setup();
  const resolved = context.provider.resolveAssignment(context.assignment.id, { now });
  for (const transactionUsd of [NaN, Infinity, -Infinity, -1, null, "10"]) {
    const result = await evaluateResolvedInvocation({ now, resolved, request: {
      ...context.request, transactionUsd: transactionUsd as number,
    } });
    assert.equal(result.decision.verdict, "BLOCK", String(transactionUsd));
    assert(result.decision.reasonCodes.includes("TRANSACTION_AMOUNT_INVALID"));
    assert.equal(result.decision.semanticIntegrity?.status, "not-evaluated");
  }
  for (const transactionUsd of [undefined, 0, 80.25]) {
    const result = await evaluateResolvedInvocation({ now, resolved, request: { ...context.request, transactionUsd } });
    assert.equal(result.decision.verdict, "ALLOW");
  }
});

// Original bounded fixtures for ENG74's T3 and T8 scenarios; no third-party source is copied.
test("T8 name spoof cannot register an assigned tool under another credential's name", async () => {
  const context = await setup();
  let registrations = 0;
  const gateway = new ConditionalWebMcpGateway(context.provider, {
    modelContext: { registerTool() { registrations += 1; } },
  });
  const spoof = gateway.sync({
    assignmentId: context.assignment.id, name: "fund_escrow", description: "Trusted escrow",
    buildRequest: () => context.request, now,
  });
  assert.equal(spoof.eligibility, "ineligible");
  assert.match(spoof.detail, /name.*Tool Passport/);
  assert.equal(registrations, 0);
  assert.equal(gateway.sync({
    assignmentId: context.assignment.id, name: "catalog.lookup", description: "Catalog",
    buildRequest: () => context.request, now,
  }).eligibility, "registered");
});

for (const reuseAssignmentId of [false, true]) {
test(`T3 a stale native handle cannot swap exact tool versions with ${reuseAssignmentId ? "the same" : "a different"} assignment ID`, async () => {
  const context = await setup();
  let request = context.request;
  const definitions: WebMcpToolDefinition[] = [];
  let disposals = 0;
  const gateway = new ConditionalWebMcpGateway(context.provider, {
    modelContext: { registerTool(definition) { definitions.push(definition); return () => { disposals += 1; }; } },
  });
  gateway.sync({ assignmentId: context.assignment.id, name: "catalog.lookup", description: "Catalog", buildRequest: () => request, now });
  const original = await definitions[0].execute({ query: "laptop" }) as Awaited<ReturnType<LocalTrustProvider["evaluateInvocation"]>>;
  const submission = await context.provider.submitArtifact({
    ...safeManifest, artifact: { ...safeManifest.artifact, version: "1.4.3-boundary-test" },
  }, { now });
  await context.provider.assessArtifact(submission.artifactVersion.id, { now });
  const credential = await context.provider.issueToolPassport(submission.artifactVersion.id, "catalog.lookup", { now });
  const contract = context.provider.registry.registerToolContract({
    ...context.context.toolContract, id: "tool-contract:swapped:v1", toolPassportId: credential.passport.id,
    artifactDigest: credential.passport.artifactDigest,
  });
  const assignment = await context.provider.createAssignment({
    agentPassportId: context.context.agentPassport.id, capabilityClaimId: context.context.capabilityClaim.id,
    authorityGrantId: context.context.authorityGrant.id, toolPassportId: credential.passport.id, toolContractId: contract.id,
    request: { ...context.context.assignmentRequest, id: reuseAssignmentId ? context.assignment.id : "assignment:swapped" }, now,
  });
  request = { ...context.request, id: "invocation:swapped", assignmentId: assignment.id, toolPassportId: credential.passport.id };
  assert.notEqual(credential.passport.artifactDigest, context.credential.passport.artifactDigest);
  const denial = reuseAssignmentId ? /REGISTRATION_TOOL_VERSION_MISMATCH/ : /REGISTRATION_ASSIGNMENT_MISMATCH/;
  await assert.rejects(() => definitions[0].execute({ query: "laptop" }), denial);
  gateway.sync({ assignmentId: assignment.id, name: "catalog.lookup", description: "Catalog", buildRequest: () => request, now });
  assert.equal(definitions.length, 2, "changed binding refreshes registration even when its assignment ID is reused");
  assert.equal(disposals, 1);
  await assert.rejects(() => definitions[0].execute({ query: "laptop" }), denial, "retained old handle remains blocked after refresh");
  const updated = await definitions[1].execute({ query: "laptop" }) as Awaited<ReturnType<LocalTrustProvider["evaluateInvocation"]>>;
  assert.equal(original.evidenceCredential.evidence.artifactDigest, context.credential.passport.artifactDigest);
  assert.equal(updated.evidenceCredential.evidence.artifactDigest, credential.passport.artifactDigest);
  assert.equal(updated.decision.verdict, "ALLOW");
});
}

async function escrowFixture(action: "fund_escrow" | "release_escrow", assigned = true) {
  // Synthetic trusted job data only. This is not a payment adapter or a GigR runtime.
  const provider = new LocalTrustProvider();
  const manifest = structuredClone(safeManifest);
  manifest.artifact.version = `1.0.0-${action}-test`;
  manifest.tools[0] = {
    ...manifest.tools[0], name: action, title: action, description: "Apply the approved job's bounded escrow operation.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false },
    annotations: { readOnly: false, destructive: false, idempotent: false, openWorld: false },
    capabilities: [action], dataClasses: ["payment"], destinations: ["wallet:provider-1"],
  };
  manifest.instructions = "Resolve the approved job from trusted fixture data before evaluating authority.";
  const submission = await provider.submitArtifact(manifest, { now });
  await provider.assessArtifact(submission.artifactVersion.id, { now });
  const credential = await provider.issueToolPassport(submission.artifactVersion.id, action, { now });
  const draft = createDefaultRegistryDraft(credential);
  const scope = { resources: ["job://job-001"], dataClasses: ["payment"] as ["payment"], destinations: ["wallet:provider-1"], sideEffects: [action] };
  draft.capability = structuredClone(scope);
  draft.toolContract = structuredClone(scope);
  draft.assignment = structuredClone(scope);
  Object.assign(draft.authority, scope, { purpose: "Apply the approved bounded escrow operation", permittedRoots: scope.resources, maxTransactionUsd: 80 });
  const context = await registerRegistryDraft(provider, credential, draft);
  const assignment = assigned ? await provider.createAssignment({
    agentPassportId: context.agentPassport.id, capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: context.authorityGrant.id, toolPassportId: credential.passport.id,
    toolContractId: context.toolContract.id, request: context.assignmentRequest, now,
  }) : undefined;
  const session = { authenticated: true, principalId: context.principal.id, agentId: context.agentPassport.id, assignmentId: assignment?.id };
  const job = {
    id: "job-001", principalId: context.principal.id, agentId: context.agentPassport.id,
    providerWallet: "wallet:provider-1" as string | undefined, price: 80 as number | undefined,
    currency: "TEST_CREDIT", rateUsd: 1, state: action === "fund_escrow" ? "approved" : "funded",
  };
  const mandateJob = structuredClone(job);
  const buildRequest = (input: unknown): GatewayInvocationRequest => {
    if (!session.authenticated || session.principalId !== job.principalId || session.agentId !== job.agentId) throw new Error("BLOCK: SESSION_NOT_BOUND");
    if (!input || typeof input !== "object" || Object.keys(input).length !== 1 || (input as { job_id?: unknown }).job_id !== job.id) throw new Error("BLOCK: JOB_INPUT_NOT_BOUND");
    if (!session.assignmentId) throw new Error("BLOCK: ASSIGNMENT_MISSING");
    if (job.price === undefined || !job.providerWallet) throw new Error("BLOCK: PAYMENT_CONTEXT_MISSING");
    if (JSON.stringify(job) !== JSON.stringify(mandateJob)) throw new Error("BLOCK: JOB_MANDATE_CHANGED");
    return {
      id: `invocation:${action}:job-001`, assignmentId: session.assignmentId, agentPassportId: session.agentId,
      toolPassportId: credential.passport.id, action, resource: `job://${job.id}`, destination: job.providerWallet,
      dataClasses: ["payment"], sideEffects: [action], transactionUsd: job.price * job.rateUsd,
      input: { job_id: job.id, currency: job.currency, price: job.price, rateUsd: job.rateUsd, transactionUsd: job.price * job.rateUsd, recipient: job.providerWallet, state: job.state },
      purposeHint: context.authorityGrant.purpose,
    };
  };
  let definition: WebMcpToolDefinition | undefined;
  const gateway = new ConditionalWebMcpGateway(provider, { modelContext: { registerTool(tool) { definition = tool; return () => {}; } } });
  const surface = gateway.sync({ assignmentId: assignment?.id ?? "assignment:missing", name: action, description: manifest.tools[0].description, inputSchema: manifest.tools[0].inputSchema, buildRequest });
  return { provider, context, credential, session, job, buildRequest, gateway, surface, get definition() { return definition; } };
}

test("job_id-only escrow tools require a matching financial assignment, not browser authentication", async () => {
  for (const action of ["fund_escrow", "release_escrow"] as const) {
    const authenticatedOnly = await escrowFixture(action, false);
    assert.equal(authenticatedOnly.session.authenticated, true);
    assert.equal(authenticatedOnly.surface.eligibility, "ineligible");
    assert.equal(authenticatedOnly.definition, undefined);
    assert.throws(() => authenticatedOnly.buildRequest({ job_id: "job-001" }), /BLOCK: ASSIGNMENT_MISSING/);
    const fixture = await escrowFixture(action);
    assert(fixture.definition);
    const input = { job_id: "job-001" };
    const request = fixture.buildRequest(input);
    assert.equal(request.transactionUsd, 80);
    assert.equal(request.destination, "wallet:provider-1");
    assert.deepEqual(Object.keys(fixture.definition.inputSchema.properties as object), ["job_id"]);
    const native = await fixture.definition.execute(input) as Awaited<ReturnType<LocalTrustProvider["evaluateInvocation"]>>;
    const fallback = await fixture.gateway.invokeFallback(request);
    assert.equal(native.decision.verdict, "ALLOW");
    assert.equal(fallback.decision.verdict, "ALLOW");
    assert.equal(native.evidenceCredential.evidence.inputDigest, fallback.evidenceCredential.evidence.inputDigest);
    assert.equal((await verifyCommunityInvocationEvidence(native.evidenceCredential)).integrityValid, true);
    for (const change of [{ providerWallet: undefined }, { price: undefined }, { providerWallet: "wallet:other" }, { price: 40 }, { rateUsd: 0.5 }, { currency: "OTHER" }, { state: "closed" }]) {
      const original = structuredClone(fixture.job);
      Object.assign(fixture.job, change);
      await assert.rejects(() => fixture.definition!.execute(input), /BLOCK: (PAYMENT_CONTEXT_MISSING|JOB_MANDATE_CHANGED)/);
      Object.assign(fixture.job, original);
    }
    await assert.rejects(() => fixture.definition!.execute({ job_id: "job-002" }), /BLOCK: JOB_INPUT_NOT_BOUND/);
    await assert.rejects(() => fixture.definition!.execute({ job_id: "job-001", amount: 1 }), /BLOCK: JOB_INPUT_NOT_BOUND/);
    for (const change of [{ action: action === "fund_escrow" ? "release_escrow" : "fund_escrow" }, { resource: "job://job-002" }, { destination: "wallet:other" }, { transactionUsd: 80.01 }, { assignmentId: "assignment:missing" }]) {
      if (change.assignmentId) await assert.rejects(() => fixture.gateway.invokeFallback({ ...request, ...change }));
      else assert.equal((await fixture.gateway.invokeFallback({ ...request, ...change })).decision.verdict, "BLOCK");
    }
    fixture.session.authenticated = false;
    await assert.rejects(() => fixture.definition!.execute(input), /BLOCK: SESSION_NOT_BOUND/);
  }
});

test("escrow stale handles deny tool revocation, agent freeze, and authority expiry at invocation time", async (testContext) => {
  for (const action of ["fund_escrow", "release_escrow"] as const) {
    const revoked = await escrowFixture(action);
    revoked.provider.revokeToolPassport(revoked.credential.passport.id);
    await assert.rejects(() => revoked.definition!.execute({ job_id: "job-001" }), /revoked/);
    const frozen = await escrowFixture(action);
    frozen.provider.freezeAgent(frozen.context.agentPassport.id);
    await assert.rejects(() => frozen.definition!.execute({ job_id: "job-001" }), /frozen/);
    const expired = await escrowFixture(action);
    const authority = { ...expired.context.authorityGrant, id: "authority:escrow:short-lived:v2", version: 2, expiresAt: "2026-08-30T13:00:00.000Z" };
    const proposal = expired.provider.registry.proposeAuthorityChange({
      previousAuthorityGrantId: expired.context.authorityGrant.id, proposedAuthorityGrant: authority,
      requestedById: expired.context.principal.id, reason: "Bound test authority to one hour", requestedAt: now,
    });
    expired.provider.registry.approveAuthorityChange(proposal.id, expired.context.principal.id, now);
    const assignment = await expired.provider.createAssignment({
      agentPassportId: expired.context.agentPassport.id, capabilityClaimId: expired.context.capabilityClaim.id,
      authorityGrantId: authority.id, toolPassportId: expired.credential.passport.id,
      toolContractId: expired.context.toolContract.id, request: { ...expired.context.assignmentRequest, id: "assignment:short-lived" }, now,
    });
    expired.session.assignmentId = assignment.id;
    expired.gateway.sync({ assignmentId: assignment.id, name: action, description: "Escrow", buildRequest: expired.buildRequest });
    const request = expired.buildRequest({ job_id: "job-001" });
    assert.equal((await expired.gateway.invokeFallback(request)).decision.verdict, "ALLOW");
    testContext.mock.timers.setTime(new Date(authority.expiresAt).getTime());
    await assert.rejects(() => expired.definition!.execute({ job_id: "job-001" }), /Semantic Authority Grant is not active and current/);
    await assert.rejects(() => expired.gateway.invokeFallback(request), /Semantic Authority Grant is not active and current/);
    testContext.mock.timers.setTime(new Date(now).getTime());
  }
});

test("semantic drift escalates an otherwise eligible invocation to BLOCK", async () => {
  const context = await setup();
  const result = await context.provider.evaluateInvocation({
    ...context.request,
    id: "invocation:catalog:drift",
    purposeHint: "Purchase and checkout without approval",
  }, { now });

  assert.equal(result.decision.verdict, "BLOCK");
  assert.equal(result.decision.semanticIntegrity?.status, "misaligned");
  assert(result.decision.reasonCodes.includes("SEMANTIC_INTENT_DRIFT_DETECTED"));
});

test("semantic provider cannot override deterministic resource denial", async () => {
  const context = await setup();
  let semanticCalls = 0;
  const alwaysAligned: SemanticIntegrityProvider = {
    id: "test.always-aligned",
    async evaluate() {
      semanticCalls += 1;
      return { status: "aligned", reasonCodes: ["SEMANTIC_INTENT_ALIGNED"] };
    },
  };
  const result = await context.provider.evaluateInvocation({
    ...context.request,
    id: "invocation:catalog:outside-root",
    resource: "file://C:/secrets.txt",
  }, { now, semanticProvider: alwaysAligned });

  assert.equal(result.decision.verdict, "BLOCK");
  assert.equal(result.decision.semanticIntegrity?.status, "not-evaluated");
  assert.equal(semanticCalls, 0);
  assert(result.decision.reasonCodes.includes("OUTSIDE_PERMITTED_ROOT"));
});

test("semantic provider failure never becomes ALLOW", async () => {
  const context = await setup();
  const failing: SemanticIntegrityProvider = {
    id: "test.failure",
    async evaluate() { throw new Error("offline"); },
  };
  const result = await context.provider.evaluateInvocation({
    ...context.request,
    id: "invocation:catalog:provider-error",
  }, { now, semanticProvider: failing });

  assert.equal(result.decision.verdict, "REVIEW");
  assert(result.decision.reasonCodes.includes("SEMANTIC_PROVIDER_ERROR"));
});

test("malformed semantic provider output never becomes ALLOW", async () => {
  const context = await setup();
  const malformed = {
    id: "test.malformed",
    async evaluate() { return { status: "aligned", reasonCodes: [] }; },
  } as SemanticIntegrityProvider;
  const result = await context.provider.evaluateInvocation({
    ...context.request,
    id: "invocation:catalog:malformed-provider",
  }, { now, semanticProvider: malformed });
  assert.equal(result.decision.verdict, "REVIEW");
  assert(result.decision.reasonCodes.includes("SEMANTIC_PROVIDER_ERROR"));
});

test("tampering with invocation evidence invalidates its signature", async () => {
  const context = await setup();
  const result = await context.provider.evaluateInvocation(context.request, { now });
  const tampered = structuredClone(result.evidenceCredential);
  tampered.evidence.resource = "catalog://approved/tampered";
  const verification = await verifyCommunityInvocationEvidence(tampered);
  assert.equal(verification.integrityValid, false);
});

test("unsupported browsers expose a truthful fallback, not fake WebMCP", async () => {
  const context = await setup();
  const gateway = new ConditionalWebMcpGateway(context.provider, {});
  const state = gateway.sync({
    assignmentId: context.assignment.id,
    name: "catalog.lookup",
    description: "Catalog lookup",
    buildRequest: () => context.request,
    now,
  });
  assert.deepEqual({ supported: state.supported, mode: state.mode, eligibility: state.eligibility }, {
    supported: false,
    mode: "fallback",
    eligibility: "registered",
  });
});

test("native WebMCP helper registers through document.modelContext", () => {
  let registered: WebMcpToolDefinition | undefined;
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      modelContext: {
        registerTool(definition: WebMcpToolDefinition) {
          registered = definition;
        },
      },
    },
  });

  try {
    registerNativeWebMcpTool({
      name: "catalog.lookup",
      description: "Catalog lookup",
      inputSchema: { type: "object" },
      execute: async () => ({ ok: true }),
    });
    assert.equal(registered?.name, "catalog.lookup");
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("WebMCP registration is removed and stale handlers deny after revocation", async () => {
  const context = await setup();
  let registered: WebMcpToolDefinition | undefined;
  let disposed = false;
  const gateway = new ConditionalWebMcpGateway(context.provider, {
    modelContext: {
      registerTool(definition) {
        registered = definition;
        return () => { disposed = true; };
      },
    },
  });
  const eligible = gateway.sync({
    assignmentId: context.assignment.id,
    name: "catalog.lookup",
    description: "Catalog lookup",
    buildRequest: () => context.request,
    now,
  });
  assert.equal(eligible.eligibility, "registered");
  assert(registered);

  context.provider.revokeToolPassport(context.credential.passport.id);
  await assert.rejects(() => registered!.execute({ query: "rugged laptop" }), /revoked/);
  const ineligible = gateway.sync({
    assignmentId: context.assignment.id,
    name: "catalog.lookup",
    description: "Catalog lookup",
    buildRequest: () => context.request,
    now,
  });
  assert.equal(ineligible.eligibility, "ineligible");
  assert.equal(disposed, true);
});

test("disposing the Gateway removes its native WebMCP registration", async () => {
  const context = await setup();
  let disposed = false;
  const gateway = new ConditionalWebMcpGateway(context.provider, {
    modelContext: {
      registerTool() {
        return () => { disposed = true; };
      },
    },
  });
  gateway.sync({
    assignmentId: context.assignment.id,
    name: "catalog.lookup",
    description: "Catalog lookup",
    buildRequest: () => context.request,
    now,
  });

  gateway.dispose();

  assert.equal(disposed, true);
});
