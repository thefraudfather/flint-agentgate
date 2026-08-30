import { sha256 } from "../domain/canonicalize";
import {
  agentCapabilityClaimSchema,
  agentPassportSchema,
  assignmentGrantSchema,
  contractVersion,
  semanticAuthorityGrantSchema,
  toolPassportSchema,
  toolSemanticContractSchema,
  type AgentCapabilityClaim,
  type AgentPassport,
  type AssignmentGrant,
  type SemanticAuthorityGrant,
  type ToolPassport,
  type ToolSemanticContract,
} from "../domain/contracts";

export type AssignmentRequest = {
  id: string;
  organizationId: string;
  allowedActions: string[];
  resourcePatterns: string[];
  dataClasses: AssignmentGrant["dataClasses"];
  destinations: string[];
  sideEffects: string[];
};

export class AssignmentRejectedError extends Error {
  readonly reasonCodes: string[];

  constructor(reasonCodes: string[]) {
    super(`Assignment rejected: ${reasonCodes.join(", ")}`);
    this.name = "AssignmentRejectedError";
    this.reasonCodes = reasonCodes;
  }
}

function patternContains(container: string, candidate: string): boolean {
  if (container === "*") return true;
  if (!container.endsWith("*")) return container === candidate;
  const containerPrefix = container.slice(0, -1);
  const candidatePrefix = candidate.endsWith("*") ? candidate.slice(0, -1) : candidate;
  return candidatePrefix.startsWith(containerPrefix);
}

function everyPatternContained(requested: string[], allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return requested.every((candidate) => allowed.some((container) => patternContains(container, candidate)));
}

function everyValueContained(requested: string[], allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return requested.every((candidate) => allowed.includes(candidate));
}

function activeAndCurrent(record: { status: string; issuedAt: string; expiresAt: string }, now: Date): boolean {
  return record.status === "active" && new Date(record.issuedAt) <= now && new Date(record.expiresAt) > now;
}

function actionDenied(grant: SemanticAuthorityGrant, action: string): boolean {
  return grant.deny.some((rule) => patternContains(rule.action, action));
}

function capabilityAllows(
  claim: AgentCapabilityClaim,
  request: AssignmentRequest,
  action: string,
): boolean {
  return claim.capabilities.some((capability) => (
    patternContains(capability.action, action)
    && everyPatternContained(request.resourcePatterns, capability.resources)
    && everyValueContained(request.dataClasses, capability.dataClasses)
    && everyPatternContained(request.destinations, capability.destinations)
    && everyValueContained(request.sideEffects, capability.sideEffects)
  ));
}

function authorityAllows(
  grant: SemanticAuthorityGrant,
  request: AssignmentRequest,
  action: string,
): boolean {
  if (actionDenied(grant, action)) return false;
  return grant.allow.some((rule) => (
    patternContains(rule.action, action)
    && everyPatternContained(request.resourcePatterns, rule.resources)
    && everyValueContained(request.dataClasses, rule.dataClasses)
    && everyPatternContained(request.destinations, rule.destinations)
  ));
}

function toolAllows(contract: ToolSemanticContract, request: AssignmentRequest, action: string): boolean {
  return contract.allowedActions.some((allowed) => patternContains(allowed, action))
    && everyPatternContained(request.resourcePatterns, contract.resources)
    && everyValueContained(request.dataClasses, contract.dataClasses)
    && everyPatternContained(request.destinations, contract.destinations)
    && everyValueContained(request.sideEffects, contract.sideEffects);
}

export async function createAssignmentGrant(input: {
  agentPassport: AgentPassport;
  capabilityClaim: AgentCapabilityClaim;
  authorityGrant: SemanticAuthorityGrant;
  toolPassport: ToolPassport;
  toolContract: ToolSemanticContract;
  request: AssignmentRequest;
  now?: string;
}): Promise<AssignmentGrant> {
  const agentPassport = agentPassportSchema.parse(input.agentPassport);
  const capabilityClaim = agentCapabilityClaimSchema.parse(input.capabilityClaim);
  const authorityGrant = semanticAuthorityGrantSchema.parse(input.authorityGrant);
  const toolPassport = toolPassportSchema.parse(input.toolPassport);
  const toolContract = toolSemanticContractSchema.parse(input.toolContract);
  const nowIso = input.now ?? new Date().toISOString();
  const now = new Date(nowIso);
  const reasons: string[] = [];

  if (!activeAndCurrent(agentPassport, now)) reasons.push("AGENT_PASSPORT_NOT_ACTIVE");
  if (!activeAndCurrent(capabilityClaim, now)) reasons.push("CAPABILITY_CLAIM_NOT_ACTIVE");
  if (!activeAndCurrent(authorityGrant, now)) reasons.push("AUTHORITY_GRANT_NOT_ACTIVE");
  if (!activeAndCurrent(toolPassport, now)) reasons.push("TOOL_PASSPORT_NOT_ACTIVE");
  if (!activeAndCurrent(toolContract, now)) reasons.push("TOOL_SEMANTIC_CONTRACT_NOT_ACTIVE");

  if (agentPassport.organizationId !== input.request.organizationId) reasons.push("ORGANIZATION_MISMATCH");
  if (capabilityClaim.agentPassportId !== agentPassport.id) reasons.push("CAPABILITY_AGENT_MISMATCH");
  if (authorityGrant.agentPassportId !== agentPassport.id) reasons.push("AUTHORITY_AGENT_MISMATCH");
  if (authorityGrant.issuerPrincipalId !== agentPassport.principalId) reasons.push("AUTHORITY_PRINCIPAL_MISMATCH");
  if (toolContract.toolPassportId !== toolPassport.id) reasons.push("TOOL_CONTRACT_PASSPORT_MISMATCH");
  if (toolContract.artifactDigest !== toolPassport.artifactDigest) reasons.push("TOOL_CONTRACT_VERSION_MISMATCH");
  if (!everyPatternContained(input.request.resourcePatterns, authorityGrant.permittedRoots)) reasons.push("RESOURCE_EXPANDS_AUTHORITY");
  if (!everyValueContained(input.request.sideEffects, authorityGrant.permittedSideEffects)) reasons.push("SIDE_EFFECT_EXPANDS_AUTHORITY");

  for (const action of input.request.allowedActions) {
    if (!capabilityAllows(capabilityClaim, input.request, action)) reasons.push("ACTION_EXPANDS_CAPABILITY");
    if (!authorityAllows(authorityGrant, input.request, action)) reasons.push("ACTION_EXPANDS_AUTHORITY");
    if (!toolAllows(toolContract, input.request, action)) reasons.push("ACTION_EXPANDS_TOOL_CONTRACT");
  }

  const uniqueReasons = [...new Set(reasons)];
  if (uniqueReasons.length > 0) throw new AssignmentRejectedError(uniqueReasons);

  const expiresAt = [
    agentPassport.expiresAt,
    capabilityClaim.expiresAt,
    authorityGrant.expiresAt,
    toolPassport.expiresAt,
    toolContract.expiresAt,
  ].sort()[0];
  const assignmentDigest = await sha256({
    request: input.request,
    agentPassportId: agentPassport.id,
    capabilityClaimId: capabilityClaim.id,
    authorityGrantId: authorityGrant.id,
    toolPassportId: toolPassport.id,
    toolContractId: toolContract.id,
  });

  return assignmentGrantSchema.parse({
    contractVersion,
    id: input.request.id || `assignment:${assignmentDigest.slice(7, 23)}`,
    organizationId: input.request.organizationId,
    agentPassportId: agentPassport.id,
    capabilityClaimId: capabilityClaim.id,
    semanticAuthorityGrantId: authorityGrant.id,
    toolPassportId: toolPassport.id,
    toolSemanticContractId: toolContract.id,
    allowedActions: input.request.allowedActions,
    resourcePatterns: input.request.resourcePatterns,
    dataClasses: input.request.dataClasses,
    destinations: input.request.destinations,
    sideEffects: input.request.sideEffects,
    status: "active",
    issuedAt: nowIso,
    expiresAt,
  });
}
