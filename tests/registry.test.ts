import assert from "node:assert/strict";
import test from "node:test";
import {
  agentCapabilityClaimSchema,
  agentPassportSchema,
  contractVersion,
  observedAgentSchema,
  organizationIdentitySchema,
  principalIdentitySchema,
  semanticAuthorityGrantSchema,
  toolSemanticContractSchema,
} from "../src/domain/contracts";
import { LocalTrustProvider } from "../src/providers/localTrustProvider";
import { AssignmentRejectedError } from "../src/registry/assignmentPolicy";
import { IdentityRegistry } from "../src/registry/identityRegistry";
import { safeManifest } from "../src/scanner/fixtures";

const now = "2026-08-30T12:00:00.000Z";
const expiresAt = "2026-09-30T12:00:00.000Z";

async function setupRegistry() {
  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(safeManifest, { now });
  await provider.assessArtifact(submission.artifactVersion.id, { now });
  const credential = await provider.issueToolPassport(submission.artifactVersion.id, safeManifest.tools[0].name, { now });
  const verification = await provider.verifyToolPassport(credential, { now });
  const registry = new IdentityRegistry();

  const organization = registry.registerOrganization(organizationIdentitySchema.parse({
    contractVersion,
    id: "org:flint-demo",
    displayName: "FLINT Demo Organization",
    status: "active",
  }));
  const principal = registry.registerPrincipal(principalIdentitySchema.parse({
    contractVersion,
    id: "principal:demo-owner",
    organizationId: organization.id,
    displayName: "Demo Owner",
    status: "active",
  }));
  const agentPassport = registry.registerAgentPassport(agentPassportSchema.parse({
    contractVersion,
    id: "agent-passport:procurement",
    organizationId: organization.id,
    principalId: principal.id,
    displayName: "Procurement Analyst",
    fingerprint: `sha256:${"a".repeat(64)}`,
    status: "active",
    issuedAt: now,
    expiresAt,
  }));
  const capabilityClaim = registry.registerCapabilityClaim(agentCapabilityClaimSchema.parse({
    contractVersion,
    id: "capability-claim:procurement:v1",
    agentPassportId: agentPassport.id,
    version: 1,
    issuerId: "community:local",
    capabilities: [{
      action: "catalog.lookup",
      resources: ["catalog://approved/*"],
      dataClasses: ["public"],
      destinations: ["catalog.northstar.example"],
      sideEffects: ["read"],
    }],
    evidenceRefs: ["assessment:capability-demo"],
    status: "active",
    issuedAt: now,
    expiresAt,
  }));
  const authorityGrant = registry.registerAuthorityGrant(semanticAuthorityGrantSchema.parse({
    contractVersion,
    id: "authority-grant:procurement:v1",
    agentPassportId: agentPassport.id,
    issuerPrincipalId: principal.id,
    version: 1,
    purpose: "Compare approved catalog products without purchasing.",
    allow: [{
      action: "catalog.lookup",
      resources: ["catalog://approved/*"],
      dataClasses: ["public"],
      destinations: ["catalog.northstar.example"],
      conditions: ["read-only"],
    }],
    deny: [{
      action: "purchase.*",
      resources: [],
      dataClasses: [],
      destinations: [],
      conditions: [],
    }],
    permittedRoots: ["catalog://approved/*"],
    permittedSideEffects: ["read"],
    status: "active",
    issuedAt: now,
    expiresAt,
  }));
  registry.registerToolCredential(credential, verification);
  const toolContract = registry.registerToolContract(toolSemanticContractSchema.parse({
    contractVersion,
    id: "tool-contract:catalog:v1",
    toolPassportId: credential.passport.id,
    artifactDigest: credential.passport.artifactDigest,
    version: 1,
    allowedActions: ["catalog.lookup"],
    resources: ["catalog://approved/*"],
    dataClasses: ["public"],
    destinations: ["catalog.northstar.example"],
    sideEffects: ["read"],
    status: "active",
    issuedAt: now,
    expiresAt,
  }));
  const observedAgent = registry.registerObservedAgent(observedAgentSchema.parse({
    contractVersion,
    id: "observed-agent:browser-session-01",
    organizationId: organization.id,
    state: "observed",
    confidence: 48,
    evidenceSources: ["browser-session", "gateway-telemetry"],
    instrumentedSurfaces: ["webmcp-gateway"],
    firstSeenAt: now,
    lastSeenAt: now,
    blindSpots: ["No endpoint or API-direct telemetry connected"],
  }));

  return { registry, organization, agentPassport, capabilityClaim, authorityGrant, credential, toolContract, observedAgent };
}

const validRequest = {
  id: "assignment:procurement:catalog",
  organizationId: "org:flint-demo",
  allowedActions: ["catalog.lookup"],
  resourcePatterns: ["catalog://approved/*"],
  dataClasses: ["public" as const],
  destinations: ["catalog.northstar.example"],
  sideEffects: ["read"],
};

test("registry keeps capability, authority, tool semantics, and assignment as separate versioned records", async () => {
  const context = await setupRegistry();
  const assignment = await context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: context.authorityGrant.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: validRequest,
    now,
  });
  const resolved = context.registry.resolveAssignment(assignment.id, { now });

  assert.equal(resolved.capabilityClaim.version, 1);
  assert.equal(resolved.authorityGrant.version, 1);
  assert.equal(resolved.toolContract.version, 1);
  assert.equal(resolved.assignment.toolPassportId, context.credential.passport.id);
  assert.deepEqual(resolved.assignment.allowedActions, ["catalog.lookup"]);
});

test("assignment rejects requested authority expansion", async () => {
  const context = await setupRegistry();
  await assert.rejects(
    () => context.registry.createAssignment({
      agentPassportId: context.agentPassport.id,
      capabilityClaimId: context.capabilityClaim.id,
      authorityGrantId: context.authorityGrant.id,
      toolPassportId: context.credential.passport.id,
      toolContractId: context.toolContract.id,
      request: {
        ...validRequest,
        id: "assignment:expanded",
        allowedActions: ["purchase.submit"],
        resourcePatterns: ["catalog://unapproved/*"],
        sideEffects: ["purchase"],
      },
      now,
    }),
    (error: unknown) => (
      error instanceof AssignmentRejectedError
      && error.reasonCodes.includes("ACTION_EXPANDS_AUTHORITY")
      && error.reasonCodes.includes("RESOURCE_EXPANDS_AUTHORITY")
    ),
  );
});

test("tool contract exact-version mismatch fails before assignment", async () => {
  const context = await setupRegistry();
  assert.throws(() => context.registry.registerToolContract(toolSemanticContractSchema.parse({
    ...context.toolContract,
    id: "tool-contract:catalog:tampered",
    artifactDigest: `sha256:${"f".repeat(64)}`,
  })), /does not match/);
});

test("registry rejects a Tool Passport without verified integrity and currency", async () => {
  const context = await setupRegistry();
  assert.throws(
    () => context.registry.registerToolCredential(context.credential, {
      integrityValid: false,
      current: true,
      flintVerified: false,
    }),
    /failed integrity/,
  );
});

test("observed, correlated, verified, and governed states advance distinctly", async () => {
  const context = await setupRegistry();
  assert.throws(
    () => context.registry.transitionObservedAgent(context.observedAgent.id, "verified", context.agentPassport.id),
    /one evidence-backed step/,
  );
  const correlated = context.registry.transitionObservedAgent(context.observedAgent.id, "correlated");
  const verified = context.registry.transitionObservedAgent(correlated.id, "verified", context.agentPassport.id);
  assert.equal(correlated.state, "correlated");
  assert.equal(verified.state, "verified");
  assert.throws(() => context.registry.transitionObservedAgent(verified.id, "governed"), /active assignment/);

  await context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: context.authorityGrant.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: validRequest,
    now,
  });
  const governed = context.registry.transitionObservedAgent(verified.id, "governed");
  assert.equal(governed.state, "governed");
});

test("freeze, revocation, and expiry fail closed during resolution", async () => {
  const frozen = await setupRegistry();
  const frozenAssignment = await frozen.registry.createAssignment({
    agentPassportId: frozen.agentPassport.id,
    capabilityClaimId: frozen.capabilityClaim.id,
    authorityGrantId: frozen.authorityGrant.id,
    toolPassportId: frozen.credential.passport.id,
    toolContractId: frozen.toolContract.id,
    request: validRequest,
    now,
  });
  frozen.registry.freezeAgent(frozen.agentPassport.id);
  assert.throws(() => frozen.registry.resolveAssignment(frozenAssignment.id, { now }), /frozen/);

  const revoked = await setupRegistry();
  const revokedAssignment = await revoked.registry.createAssignment({
    agentPassportId: revoked.agentPassport.id,
    capabilityClaimId: revoked.capabilityClaim.id,
    authorityGrantId: revoked.authorityGrant.id,
    toolPassportId: revoked.credential.passport.id,
    toolContractId: revoked.toolContract.id,
    request: validRequest,
    now,
  });
  revoked.registry.revokeToolPassport(revoked.credential.passport.id);
  assert.throws(() => revoked.registry.resolveAssignment(revokedAssignment.id, { now }), /revoked/);

  const expired = await setupRegistry();
  const expiredAssignment = await expired.registry.createAssignment({
    agentPassportId: expired.agentPassport.id,
    capabilityClaimId: expired.capabilityClaim.id,
    authorityGrantId: expired.authorityGrant.id,
    toolPassportId: expired.credential.passport.id,
    toolContractId: expired.toolContract.id,
    request: validRequest,
    now,
  });
  assert.throws(
    () => expired.registry.resolveAssignment(expiredAssignment.id, { now: "2026-10-01T00:00:00.000Z" }),
    /not active and current/,
  );
});
