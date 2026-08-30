import {
  agentCapabilityClaimSchema,
  agentPassportSchema,
  contractVersion,
  observedAgentSchema,
  organizationIdentitySchema,
  principalIdentitySchema,
  semanticAuthorityGrantSchema,
  toolSemanticContractSchema,
  type ToolPassportCredential,
} from "../domain/contracts";
import type { LocalTrustProvider } from "../providers/localTrustProvider";
import type { AssignmentRequest } from "./assignmentPolicy";

export function seedDemoRegistry(provider: LocalTrustProvider, credential: ToolPassportCredential) {
  const issuedAt = credential.passport.issuedAt;
  const expiresAt = credential.passport.expiresAt;
  const organization = provider.registry.registerOrganization(organizationIdentitySchema.parse({
    contractVersion,
    id: "org:flint-demo",
    displayName: "FLINT Demo Organization",
    status: "active",
  }));
  const principal = provider.registry.registerPrincipal(principalIdentitySchema.parse({
    contractVersion,
    id: "principal:demo-owner",
    organizationId: organization.id,
    displayName: "Demo Owner",
    status: "active",
  }));
  const observedAgent = provider.registry.registerObservedAgent(observedAgentSchema.parse({
    contractVersion,
    id: "observed-agent:browser-session-01",
    organizationId: organization.id,
    state: "observed",
    confidence: 48,
    evidenceSources: ["browser-session", "gateway-telemetry"],
    instrumentedSurfaces: ["webmcp-gateway"],
    firstSeenAt: issuedAt,
    lastSeenAt: issuedAt,
    blindSpots: ["No endpoint or API-direct telemetry connected"],
  }));
  const agentPassport = provider.registry.registerAgentPassport(agentPassportSchema.parse({
    contractVersion,
    id: "agent-passport:procurement",
    organizationId: organization.id,
    principalId: principal.id,
    displayName: "Procurement Analyst",
    fingerprint: `sha256:${"a".repeat(64)}`,
    status: "active",
    issuedAt,
    expiresAt,
  }));
  const capabilityClaim = provider.registry.registerCapabilityClaim(agentCapabilityClaimSchema.parse({
    contractVersion,
    id: "capability-claim:procurement:v1",
    agentPassportId: agentPassport.id,
    version: 1,
    issuerId: "community:local",
    capabilities: [{
      action: credential.passport.toolName,
      resources: ["catalog://approved/*"],
      dataClasses: credential.passport.dataClasses,
      destinations: credential.passport.destinations,
      sideEffects: ["read"],
    }],
    evidenceRefs: [credential.passport.assessmentId],
    status: "active",
    issuedAt,
    expiresAt,
  }));
  const authorityGrant = provider.registry.registerAuthorityGrant(semanticAuthorityGrantSchema.parse({
    contractVersion,
    id: "authority-grant:procurement:v1",
    agentPassportId: agentPassport.id,
    issuerPrincipalId: principal.id,
    version: 1,
    purpose: "Compare approved catalog products without purchasing.",
    allow: [{
      action: credential.passport.toolName,
      resources: ["catalog://approved/*"],
      dataClasses: credential.passport.dataClasses,
      destinations: credential.passport.destinations,
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
    issuedAt,
    expiresAt,
  }));
  const toolContract = provider.registry.registerToolContract(toolSemanticContractSchema.parse({
    contractVersion,
    id: "tool-contract:catalog:v1",
    toolPassportId: credential.passport.id,
    artifactDigest: credential.passport.artifactDigest,
    version: 1,
    allowedActions: [credential.passport.toolName],
    resources: ["catalog://approved/*"],
    dataClasses: credential.passport.dataClasses,
    destinations: credential.passport.destinations,
    sideEffects: ["read"],
    status: "active",
    issuedAt,
    expiresAt,
  }));

  const assignmentRequest: AssignmentRequest = {
    id: "assignment:procurement:catalog",
    organizationId: organization.id,
    allowedActions: [credential.passport.toolName],
    resourcePatterns: ["catalog://approved/*"],
    dataClasses: credential.passport.dataClasses,
    destinations: credential.passport.destinations,
    sideEffects: ["read"],
  };

  return { organization, principal, observedAgent, agentPassport, capabilityClaim, authorityGrant, toolContract, assignmentRequest };
}
