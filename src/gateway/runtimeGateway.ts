import { sha256 } from "../domain/canonicalize";
import {
  contractVersion,
  gatewayDecisionSchema,
  type GatewayDecision,
} from "../domain/contracts";
import type { ResolvedAssignment } from "../registry/identityRegistry";

export type GatewayInvocationRequest = {
  id: string;
  assignmentId: string;
  agentPassportId: string;
  toolPassportId: string;
  action: string;
  resource: string;
  destination: string;
  dataClasses: ResolvedAssignment["assignment"]["dataClasses"];
  sideEffects: string[];
  input: unknown;
  purposeHint?: string;
  transactionUsd?: number;
};

export type SemanticIntegrityResult = {
  status: "aligned" | "uncertain" | "misaligned" | "error";
  reasonCodes: string[];
};

export interface SemanticIntegrityProvider {
  readonly id: string;
  evaluate(input: {
    request: GatewayInvocationRequest;
    resolved: ResolvedAssignment;
  }): Promise<SemanticIntegrityResult>;
}

export const deterministicSemanticIntegrity: SemanticIntegrityProvider = {
  id: "flint.agentgate.semantic-integrity.deterministic.v0",
  async evaluate({ request }) {
    const hint = request.purposeHint?.toLowerCase().trim();
    if (!hint) return { status: "uncertain", reasonCodes: ["SEMANTIC_PURPOSE_UNAVAILABLE"] };
    if (/purchase|checkout|delete|exfiltrat|bypass|disable/.test(hint)) {
      return { status: "misaligned", reasonCodes: ["SEMANTIC_INTENT_DRIFT_DETECTED"] };
    }
    return { status: "aligned", reasonCodes: ["SEMANTIC_INTENT_ALIGNED"] };
  },
};

function matches(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.endsWith("*")) return pattern === value;
  return value.startsWith(pattern.slice(0, -1));
}

function anyMatch(patterns: string[], value: string): boolean {
  return patterns.some((pattern) => matches(pattern, value));
}

function ruleMatches(
  rule: ResolvedAssignment["authorityGrant"]["allow"][number],
  request: GatewayInvocationRequest,
): boolean {
  return matches(rule.action, request.action)
    && (rule.resources.length === 0 || anyMatch(rule.resources, request.resource))
    && (rule.destinations.length === 0 || anyMatch(rule.destinations, request.destination))
    && request.dataClasses.every((item) => rule.dataClasses.length === 0 || rule.dataClasses.includes(item));
}

export async function evaluateResolvedInvocation(input: {
  request: GatewayInvocationRequest;
  resolved: ResolvedAssignment;
  semanticProvider?: SemanticIntegrityProvider;
  now?: string;
}): Promise<{ decision: GatewayDecision; inputDigest: string }> {
  const { request, resolved } = input;
  const reasons: string[] = [];
  const assignment = resolved.assignment;
  const authority = resolved.authorityGrant;
  const contract = resolved.toolContract;

  if (request.assignmentId !== assignment.id) reasons.push("ASSIGNMENT_ID_MISMATCH");
  if (request.agentPassportId !== assignment.agentPassportId) reasons.push("ASSIGNMENT_AGENT_MISMATCH");
  if (request.toolPassportId !== assignment.toolPassportId) reasons.push("ASSIGNMENT_TOOL_MISMATCH");
  if (!anyMatch(assignment.allowedActions, request.action)) reasons.push("ACTION_NOT_ASSIGNED");
  if (assignment.resourcePatterns.length > 0 && !anyMatch(assignment.resourcePatterns, request.resource)) reasons.push("RESOURCE_NOT_ASSIGNED");
  if (assignment.destinations.length > 0 && !anyMatch(assignment.destinations, request.destination)) reasons.push("DESTINATION_NOT_ASSIGNED");
  if (assignment.dataClasses.length > 0 && request.dataClasses.some((item) => !assignment.dataClasses.includes(item))) reasons.push("DATA_CLASS_NOT_ASSIGNED");
  if (assignment.sideEffects.length > 0 && request.sideEffects.some((item) => !assignment.sideEffects.includes(item))) reasons.push("SIDE_EFFECT_NOT_ASSIGNED");

  if (!anyMatch(contract.allowedActions, request.action)) reasons.push("ACTION_OUTSIDE_TOOL_CONTRACT");
  if (contract.resources.length > 0 && !anyMatch(contract.resources, request.resource)) reasons.push("RESOURCE_OUTSIDE_TOOL_CONTRACT");
  if (contract.destinations.length > 0 && !anyMatch(contract.destinations, request.destination)) reasons.push("DESTINATION_OUTSIDE_TOOL_CONTRACT");
  if (contract.dataClasses.length > 0 && request.dataClasses.some((item) => !contract.dataClasses.includes(item))) reasons.push("DATA_CLASS_OUTSIDE_TOOL_CONTRACT");
  if (contract.sideEffects.length > 0 && request.sideEffects.some((item) => !contract.sideEffects.includes(item))) reasons.push("SIDE_EFFECT_OUTSIDE_TOOL_CONTRACT");

  if (authority.deny.some((rule) => ruleMatches(rule, request))) reasons.push("SEMANTIC_DENY_MATCHED");
  if (!authority.allow.some((rule) => ruleMatches(rule, request))) reasons.push("OUTSIDE_SEMANTIC_AUTHORITY");
  if (authority.permittedRoots.length > 0 && !anyMatch(authority.permittedRoots, request.resource)) {
    reasons.push("OUTSIDE_PERMITTED_ROOT");
  }
  if (authority.permittedSideEffects.length > 0 && request.sideEffects.some((item) => !authority.permittedSideEffects.includes(item))) {
    reasons.push("SIDE_EFFECT_OUTSIDE_SEMANTIC_AUTHORITY");
  }
  if (
    request.transactionUsd !== undefined
    && authority.maxTransactionUsd !== undefined
    && request.transactionUsd > authority.maxTransactionUsd
  ) reasons.push("TRANSACTION_LIMIT_EXCEEDED");

  const policyDigest = await sha256({
    agentPassport: resolved.agentPassport,
    capabilityClaim: resolved.capabilityClaim,
    authorityGrant: authority,
    toolPassport: resolved.credential.passport,
    toolContract: contract,
    assignment,
  });
  const inputDigest = await sha256(request.input);
  const deterministicDenied = reasons.length > 0;
  let semanticIntegrity: GatewayDecision["semanticIntegrity"] = {
    status: "not-evaluated",
    reasonCodes: [deterministicDenied ? "DETERMINISTIC_POLICY_DENIED" : "SEMANTIC_EVALUATION_PENDING"],
  };

  if (!deterministicDenied) {
    try {
      const result = await (input.semanticProvider ?? deterministicSemanticIntegrity).evaluate({ request, resolved });
      if (
        !["aligned", "uncertain", "misaligned", "error"].includes(result.status)
        || !Array.isArray(result.reasonCodes)
        || result.reasonCodes.length === 0
        || result.reasonCodes.some((reason) => typeof reason !== "string" || !/^[a-zA-Z0-9_.:-]+$/.test(reason))
      ) throw new Error("Semantic provider returned an invalid result.");
      semanticIntegrity = result;
      if (result.status !== "aligned") reasons.push(...result.reasonCodes);
    } catch {
      semanticIntegrity = { status: "error", reasonCodes: ["SEMANTIC_PROVIDER_ERROR"] };
      reasons.push("SEMANTIC_PROVIDER_ERROR");
    }
  }

  const verdict = deterministicDenied || semanticIntegrity.status === "misaligned"
    ? "BLOCK"
    : semanticIntegrity.status === "uncertain" || semanticIntegrity.status === "error"
      ? "REVIEW"
      : "ALLOW";
  const now = input.now ?? new Date().toISOString();

  return {
    inputDigest,
    decision: gatewayDecisionSchema.parse({
      contractVersion,
      id: `decision:${request.id}`,
      requestId: request.id,
      agentId: request.agentPassportId,
      toolPassportId: request.toolPassportId,
      assignmentId: assignment.id,
      verdict,
      reasonCodes: reasons.length === 0 ? ["POLICY_INTERSECTION_SATISFIED"] : [...new Set(reasons)],
      evaluatedAt: now,
      policyDigest,
      semanticIntegrity,
    }),
  };
}
