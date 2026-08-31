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
import { AssignmentRejectedError, intersectPatternScopes } from "../src/registry/assignmentPolicy";
import { classifyAuthorityChange } from "../src/registry/authorityChanges";
import { IdentityRegistry } from "../src/registry/identityRegistry";
import { safeManifest } from "../src/scanner/fixtures";

const now = "2026-08-30T12:00:00.000Z";
const expiresAt = "2026-09-30T12:00:00.000Z";

test("pattern intersection narrows a replacement assignment without expanding it", () => {
  assert.deepEqual(
    intersectPatternScopes(["catalog://approved/*"], ["catalog://approved/laptops/*"]),
    ["catalog://approved/laptops/*"],
  );
  assert.deepEqual(
    intersectPatternScopes(["catalog://approved/laptops/*"], ["catalog://approved/*"]),
    ["catalog://approved/laptops/*"],
  );
});

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

test("assignment preflight rejects an unconstrained empty scope under constrained authority", async () => {
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
        id: "assignment:unconstrained-expansion",
        resourcePatterns: [],
        dataClasses: [],
        destinations: [],
        sideEffects: [],
      },
      now,
    }),
    (error: unknown) => error instanceof AssignmentRejectedError
      && error.reasonCodes.includes("RESOURCE_EXPANDS_AUTHORITY")
      && error.reasonCodes.includes("SIDE_EFFECT_EXPANDS_AUTHORITY")
      && error.reasonCodes.includes("ACTION_EXPANDS_CAPABILITY")
      && error.reasonCodes.includes("ACTION_EXPANDS_TOOL_CONTRACT"),
  );
});

test("authority revisions stay unusable until approval and supersede old assignments", async () => {
  const context = await setupRegistry();
  const oldAssignment = await context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: context.authorityGrant.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: validRequest,
    now,
  });
  const correlated = context.registry.transitionObservedAgent(context.observedAgent.id, "correlated");
  const verified = context.registry.transitionObservedAgent(correlated.id, "verified", context.agentPassport.id);
  const governed = context.registry.transitionObservedAgent(verified.id, "governed");
  assert.equal(governed.state, "governed");
  const proposedGrant = semanticAuthorityGrantSchema.parse({
    ...context.authorityGrant,
    id: "authority-grant:procurement:v2",
    version: 2,
    purpose: "Compare approved replacement parts only.",
    allow: [{
      ...context.authorityGrant.allow[0],
      resources: ["catalog://approved/parts/*"],
      conditions: ["read-only", "replacement-parts-only"],
    }],
    permittedRoots: ["catalog://approved/parts/*"],
  });
  const change = context.registry.proposeAuthorityChange({
    previousAuthorityGrantId: context.authorityGrant.id,
    proposedAuthorityGrant: proposedGrant,
    requestedById: "operator:community-demo",
    reason: "Reduce the agent blast radius to replacement parts.",
    requestedAt: now,
  });

  assert.equal(change.classification, "narrowing");
  await assert.rejects(() => context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: proposedGrant.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: { ...validRequest, id: "assignment:pending", resourcePatterns: ["catalog://approved/parts/*"] },
    now,
  }), /pending approval/);

  const approved = context.registry.approveAuthorityChange(change.id, context.authorityGrant.issuerPrincipalId, now);
  assert.equal(approved.status, "approved");
  assert.throws(() => context.registry.resolveAssignment(oldAssignment.id, { now }), /superseded/);

  const replacement = await context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: proposedGrant.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: {
      ...validRequest,
      id: "assignment:replacement",
      resourcePatterns: intersectPatternScopes(validRequest.resourcePatterns, proposedGrant.permittedRoots),
    },
    now,
  });
  assert.equal(context.registry.resolveAssignment(replacement.id, { now }).authorityGrant.version, 2);
  assert.equal(context.registry.snapshot().observedAgents[0].state, "governed");
});

test("initial authority registration is immutable and cannot bypass revision approval", async () => {
  const context = await setupRegistry();
  const original = context.registry.authorityGrant(context.authorityGrant.id);

  assert.throws(() => context.registry.registerAuthorityGrant(semanticAuthorityGrantSchema.parse({
    ...context.authorityGrant,
    purpose: "Overwritten authority.",
  })), /ID is already registered/);
  assert.equal(context.registry.authorityGrant(context.authorityGrant.id).purpose, original.purpose);

  assert.throws(() => context.registry.registerAuthorityGrant(semanticAuthorityGrantSchema.parse({
    ...context.authorityGrant,
    id: "authority-grant:procurement:v2-direct",
    version: 2,
  })), /must be version 1/);

  assert.throws(() => context.registry.registerAuthorityGrant(semanticAuthorityGrantSchema.parse({
    ...context.authorityGrant,
    id: "authority-grant:procurement:alternate-v1",
  })), /already has a Semantic Authority Grant lineage/);
});

test("authority revisions reject pending parents and preserve sequential approved lineage", async () => {
  const context = await setupRegistry();
  const assignmentV1 = await context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: context.authorityGrant.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: { ...validRequest, id: "assignment:lineage-v1" },
    now,
  });
  const proposedV2 = semanticAuthorityGrantSchema.parse({
    ...context.authorityGrant,
    id: "authority-grant:procurement:v2",
    version: 2,
  });
  const changeV2 = context.registry.proposeAuthorityChange({
    previousAuthorityGrantId: context.authorityGrant.id,
    proposedAuthorityGrant: proposedV2,
    requestedById: "operator:community-demo",
    reason: "Create the second approved authority version.",
    requestedAt: now,
  });
  const proposedV3 = semanticAuthorityGrantSchema.parse({
    ...proposedV2,
    id: "authority-grant:procurement:v3",
    version: 3,
  });

  assert.throws(() => context.registry.proposeAuthorityChange({
    previousAuthorityGrantId: proposedV2.id,
    proposedAuthorityGrant: proposedV3,
    requestedById: "operator:community-demo",
    reason: "Attempt to skip approval of version two.",
    requestedAt: now,
  }), /Cannot revise a pending/);
  assert.equal(context.registry.snapshot().authorityGrants.length, 2);

  context.registry.approveAuthorityChange(changeV2.id, context.authorityGrant.issuerPrincipalId, now);
  assert.throws(() => context.registry.resolveAssignment(assignmentV1.id, { now }), /superseded/);
  const assignmentV2 = await context.registry.createAssignment({
    agentPassportId: context.agentPassport.id,
    capabilityClaimId: context.capabilityClaim.id,
    authorityGrantId: proposedV2.id,
    toolPassportId: context.credential.passport.id,
    toolContractId: context.toolContract.id,
    request: { ...validRequest, id: "assignment:lineage-v2" },
    now,
  });
  const changeV3 = context.registry.proposeAuthorityChange({
    previousAuthorityGrantId: proposedV2.id,
    proposedAuthorityGrant: proposedV3,
    requestedById: "operator:community-demo",
    reason: "Advance from the approved lineage head.",
    requestedAt: now,
  });
  const approvedV3 = context.registry.approveAuthorityChange(changeV3.id, context.authorityGrant.issuerPrincipalId, now);

  assert.equal(approvedV3.status, "approved");
  assert.throws(() => context.registry.resolveAssignment(assignmentV2.id, { now }), /superseded/);
  assert.equal(context.registry.authorityGrant(proposedV3.id).version, 3);
});

test("authority revision classifier surfaces expansions", async () => {
  const context = await setupRegistry();
  const change = context.registry.proposeAuthorityChange({
    previousAuthorityGrantId: context.authorityGrant.id,
    proposedAuthorityGrant: semanticAuthorityGrantSchema.parse({
      ...context.authorityGrant,
      id: "authority-grant:procurement:v2",
      version: 2,
      allow: [{ ...context.authorityGrant.allow[0], resources: ["catalog://*"] }],
      permittedRoots: ["catalog://*"],
    }),
    requestedById: "operator:community-demo",
    reason: "Request broader catalog access.",
    requestedAt: now,
  });

  assert.equal(change.classification, "expansion");
});

test("authority revision classifier treats added conditions as narrowing", async () => {
  const context = await setupRegistry();
  const previous = semanticAuthorityGrantSchema.parse({
    ...context.authorityGrant,
    allow: [{ ...context.authorityGrant.allow[0], conditions: [] }],
  });
  const proposed = semanticAuthorityGrantSchema.parse({
    ...previous,
    id: "authority-grant:procurement:v2",
    version: 2,
    allow: [{ ...previous.allow[0], conditions: ["human-approved"] }],
  });

  assert.equal(classifyAuthorityChange(previous, proposed), "narrowing");
  assert.equal(classifyAuthorityChange(proposed, previous), "expansion");
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
