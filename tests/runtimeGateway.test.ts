import assert from "node:assert/strict";
import test from "node:test";
import { verifyCommunityInvocationEvidence } from "../src/credentials/communityIssuer";
import type { GatewayInvocationRequest, SemanticIntegrityProvider } from "../src/gateway/runtimeGateway";
import { LocalTrustProvider } from "../src/providers/localTrustProvider";
import { seedDemoRegistry } from "../src/registry/demoRegistry";
import { safeManifest } from "../src/scanner/fixtures";
import {
  ConditionalWebMcpGateway,
  type WebMcpToolDefinition,
} from "../src/webmcp/conditionalGateway";

const now = "2026-08-30T12:00:00.000Z";

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
