import assert from "node:assert/strict";
import test from "node:test";
import {
  agentIdentitySchema,
  artifactManifestSchema,
  contractVersion,
  gatewayDecisionSchema,
  toolAssignmentSchema,
  toolPassportSchema,
  type AgentIdentity,
  type ToolAssignment,
  type ToolPassport,
} from "../src/domain/contracts";
import { evaluateRequest } from "../src/gateway/evaluateRequest";
import { safeManifest } from "../src/scanner/fixtures";

const now = "2026-08-29T12:00:00.000Z";

const agent: AgentIdentity = agentIdentitySchema.parse({
  contractVersion,
  id: "agent:procurement-01",
  organizationId: "org:flint-demo",
  principalId: "principal:jt",
  displayName: "Procurement Analyst",
  status: "active",
  fingerprint: `sha256:${"a".repeat(64)}`,
  authority: {
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
  },
  issuedAt: "2026-08-29T00:00:00.000Z",
  expiresAt: "2026-09-29T00:00:00.000Z",
});

const passport: ToolPassport = toolPassportSchema.parse({
  contractVersion,
  id: "tool-passport:catalog-lookup:1.4.2",
  toolName: "catalog.lookup",
  artifactId: safeManifest.artifact.id,
  artifactVersion: safeManifest.artifact.version,
  artifactDigest: `sha256:${"b".repeat(64)}`,
  assessmentId: "assessment:catalog-lookup",
  stampId: "stamp:catalog-lookup",
  capabilities: ["catalog:read"],
  dataClasses: ["public"],
  destinations: ["catalog.northstar.example"],
  issuedAt: "2026-08-29T00:00:00.000Z",
  expiresAt: "2026-09-29T00:00:00.000Z",
  status: "active",
});

const assignment: ToolAssignment = toolAssignmentSchema.parse({
  contractVersion,
  id: "assignment:procurement:catalog",
  organizationId: "org:flint-demo",
  agentId: agent.id,
  toolPassportId: passport.id,
  allowedActions: ["catalog.lookup"],
  resourcePatterns: ["catalog://approved/*"],
  dataClasses: ["public"],
  destinations: ["catalog.northstar.example"],
  status: "active",
  expiresAt: "2026-09-29T00:00:00.000Z",
});

test("accepts the versioned demo artifact contract", () => {
  assert.equal(artifactManifestSchema.parse(safeManifest).contractVersion, contractVersion);
});

test("allows only when identity, passport, assignment, and request intersect", async () => {
  const decision = await evaluateRequest({
    now,
    agent,
    passport,
    assignment,
    request: {
      id: "request:allowed",
      agentId: agent.id,
      toolPassportId: passport.id,
      action: "catalog.lookup",
      resource: "catalog://approved/espresso-001",
      destination: "catalog.northstar.example",
      dataClasses: ["public"],
    },
  });

  assert.equal(gatewayDecisionSchema.parse(decision).verdict, "ALLOW");
  assert.deepEqual(decision.reasonCodes, ["POLICY_INTERSECTION_SATISFIED"]);
});

test("blocks a request outside semantic authority even when a tool is assigned", async () => {
  const decision = await evaluateRequest({
    now,
    agent,
    passport,
    assignment: { ...assignment, allowedActions: ["catalog.lookup", "purchase.submit"] },
    request: {
      id: "request:blocked",
      agentId: agent.id,
      toolPassportId: passport.id,
      action: "purchase.submit",
      resource: "catalog://approved/espresso-001",
      destination: "catalog.northstar.example",
      dataClasses: ["public"],
    },
  });

  assert.equal(decision.verdict, "BLOCK");
  assert.ok(decision.reasonCodes.includes("SEMANTIC_DENY_MATCHED"));
  assert.ok(decision.reasonCodes.includes("OUTSIDE_SEMANTIC_AUTHORITY"));
});
