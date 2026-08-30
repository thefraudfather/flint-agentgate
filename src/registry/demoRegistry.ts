import {
  agentCapabilityClaimSchema,
  agentPassportSchema,
  contractVersion,
  observedAgentSchema,
  organizationIdentitySchema,
  principalIdentitySchema,
  semanticAuthorityGrantSchema,
  toolSemanticContractSchema,
  type AgentCapabilityClaim,
  type AgentPassport,
  type ObservedAgent,
  type OrganizationIdentity,
  type PrincipalIdentity,
  type SemanticAuthorityGrant,
  type ToolPassportCredential,
  type ToolSemanticContract,
} from "../domain/contracts";
import type { LocalTrustProvider } from "../providers/localTrustProvider";
import { createAssignmentGrant, type AssignmentRequest } from "./assignmentPolicy";

export type RegistryScopeDraft = {
  resources: string[];
  dataClasses: ToolPassportCredential["passport"]["dataClasses"];
  destinations: string[];
  sideEffects: string[];
};

export type IdentityRegistryDraft = {
  organization: { id: string; displayName: string };
  principal: { id: string; displayName: string };
  observation: {
    id: string;
    confidence: number;
    evidenceSources: string[];
    instrumentedSurfaces: string[];
    blindSpots: string[];
  };
  agent: { id: string; displayName: string; fingerprint: string };
  capability: RegistryScopeDraft;
  authority: RegistryScopeDraft & {
    purpose: string;
    conditions: string[];
    deniedActions: string[];
    permittedRoots: string[];
    maxTransactionUsd?: number;
  };
  toolContract: RegistryScopeDraft;
  assignment: RegistryScopeDraft;
};

export type RegistryContext = {
  organization: OrganizationIdentity;
  principal: PrincipalIdentity;
  observedAgent: ObservedAgent;
  agentPassport: AgentPassport;
  capabilityClaim: AgentCapabilityClaim;
  authorityGrant: SemanticAuthorityGrant;
  toolContract: ToolSemanticContract;
  assignmentRequest: AssignmentRequest;
};

export function createDefaultRegistryDraft(credential: ToolPassportCredential): IdentityRegistryDraft {
  const isCatalogDemo = credential.passport.toolName === "catalog.lookup";
  const toolSlug = credential.passport.toolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "declared-tool";
  const toolLabel = toolSlug.split("-").map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
  const resourceRoot = isCatalogDemo ? "catalog://approved/*" : `tool://${toolSlug}/*`;
  const sharedScope: RegistryScopeDraft = {
    resources: [resourceRoot],
    dataClasses: [...credential.passport.dataClasses],
    destinations: [...credential.passport.destinations],
    sideEffects: ["read"],
  };

  return {
    organization: { id: "org:flint-demo", displayName: "FLINT Demo Organization" },
    principal: { id: "principal:demo-owner", displayName: "Demo Owner" },
    observation: {
      id: "observed-agent:browser-session-01",
      confidence: 48,
      evidenceSources: ["browser-session", "gateway-telemetry"],
      instrumentedSurfaces: ["webmcp-gateway"],
      blindSpots: ["No endpoint or API-direct telemetry connected"],
    },
    agent: {
      id: `agent-passport:${isCatalogDemo ? "procurement" : toolSlug}`,
      displayName: isCatalogDemo ? "Procurement Analyst" : `${toolLabel} Agent`,
      fingerprint: `sha256:${"a".repeat(64)}`,
    },
    capability: structuredClone(sharedScope),
    authority: {
      ...structuredClone(sharedScope),
      purpose: isCatalogDemo
        ? "Compare approved catalog products without purchasing."
        : `Use ${credential.passport.toolName} within its declared scope.`,
      conditions: isCatalogDemo ? ["read-only"] : [],
      deniedActions: isCatalogDemo ? ["purchase.*"] : [],
      permittedRoots: [resourceRoot],
    },
    toolContract: structuredClone(sharedScope),
    assignment: structuredClone(sharedScope),
  };
}

function buildRegistryContext(
  credential: ToolPassportCredential,
  draft: IdentityRegistryDraft,
): RegistryContext {
  const issuedAt = credential.passport.issuedAt;
  const expiresAt = credential.passport.expiresAt;
  const action = credential.passport.toolName;
  const organization = organizationIdentitySchema.parse({
    contractVersion,
    id: draft.organization.id,
    displayName: draft.organization.displayName,
    status: "active",
  });
  const principal = principalIdentitySchema.parse({
    contractVersion,
    id: draft.principal.id,
    organizationId: organization.id,
    displayName: draft.principal.displayName,
    status: "active",
  });
  const observedAgent = observedAgentSchema.parse({
    contractVersion,
    id: draft.observation.id,
    organizationId: organization.id,
    state: "observed",
    confidence: draft.observation.confidence,
    evidenceSources: draft.observation.evidenceSources,
    instrumentedSurfaces: draft.observation.instrumentedSurfaces,
    firstSeenAt: issuedAt,
    lastSeenAt: issuedAt,
    blindSpots: draft.observation.blindSpots,
  });
  const agentPassport = agentPassportSchema.parse({
    contractVersion,
    id: draft.agent.id,
    organizationId: organization.id,
    principalId: principal.id,
    displayName: draft.agent.displayName,
    fingerprint: draft.agent.fingerprint,
    status: "active",
    issuedAt,
    expiresAt,
  });
  const capabilityClaim = agentCapabilityClaimSchema.parse({
    contractVersion,
    id: `capability-claim:${draft.agent.id}:v1`,
    agentPassportId: agentPassport.id,
    version: 1,
    issuerId: "community:local",
    capabilities: [{ action, ...draft.capability }],
    evidenceRefs: [credential.passport.assessmentId],
    status: "active",
    issuedAt,
    expiresAt,
  });
  const authorityGrant = semanticAuthorityGrantSchema.parse({
    contractVersion,
    id: `authority-grant:${draft.agent.id}:v1`,
    agentPassportId: agentPassport.id,
    issuerPrincipalId: principal.id,
    version: 1,
    purpose: draft.authority.purpose,
    allow: [{
      action,
      resources: draft.authority.resources,
      dataClasses: draft.authority.dataClasses,
      destinations: draft.authority.destinations,
      conditions: draft.authority.conditions,
    }],
    deny: draft.authority.deniedActions.map((deniedAction) => ({
      action: deniedAction,
      resources: [],
      dataClasses: [],
      destinations: [],
      conditions: [],
    })),
    permittedRoots: draft.authority.permittedRoots,
    permittedSideEffects: draft.authority.sideEffects,
    maxTransactionUsd: draft.authority.maxTransactionUsd,
    status: "active",
    issuedAt,
    expiresAt,
  });
  const toolContract = toolSemanticContractSchema.parse({
    contractVersion,
    id: `tool-contract:${credential.passport.id}:v1`,
    toolPassportId: credential.passport.id,
    artifactDigest: credential.passport.artifactDigest,
    version: 1,
    allowedActions: [action],
    resources: draft.toolContract.resources,
    dataClasses: draft.toolContract.dataClasses,
    destinations: draft.toolContract.destinations,
    sideEffects: draft.toolContract.sideEffects,
    status: "active",
    issuedAt,
    expiresAt,
  });
  const assignmentRequest: AssignmentRequest = {
    id: `assignment:${draft.agent.id}:${credential.passport.toolName}`,
    organizationId: organization.id,
    allowedActions: [action],
    resourcePatterns: draft.assignment.resources,
    dataClasses: draft.assignment.dataClasses,
    destinations: draft.assignment.destinations,
    sideEffects: draft.assignment.sideEffects,
  };

  return { organization, principal, observedAgent, agentPassport, capabilityClaim, authorityGrant, toolContract, assignmentRequest };
}

function commitRegistryContext(provider: LocalTrustProvider, context: RegistryContext): RegistryContext {
  provider.registry.registerOrganization(context.organization);
  provider.registry.registerPrincipal(context.principal);
  provider.registry.registerObservedAgent(context.observedAgent);
  provider.registry.registerAgentPassport(context.agentPassport);
  provider.registry.registerCapabilityClaim(context.capabilityClaim);
  provider.registry.registerAuthorityGrant(context.authorityGrant);
  provider.registry.registerToolContract(context.toolContract);
  return context;
}

export async function registerRegistryDraft(
  provider: LocalTrustProvider,
  credential: ToolPassportCredential,
  draft: IdentityRegistryDraft,
): Promise<RegistryContext> {
  const context = buildRegistryContext(credential, draft);

  await createAssignmentGrant({
    agentPassport: context.agentPassport,
    capabilityClaim: context.capabilityClaim,
    authorityGrant: context.authorityGrant,
    toolPassport: credential.passport,
    toolContract: context.toolContract,
    request: context.assignmentRequest,
  });

  return commitRegistryContext(provider, context);
}

export function seedDemoRegistry(provider: LocalTrustProvider, credential: ToolPassportCredential): RegistryContext {
  return commitRegistryContext(provider, buildRegistryContext(credential, createDefaultRegistryDraft(credential)));
}
