import { sha256 } from "../domain/canonicalize";
import {
  contractVersion,
  gatewayDecisionSchema,
  type AgentIdentity,
  type GatewayDecision,
  type ToolAssignment,
  type ToolPassport,
} from "../domain/contracts";

export type GatewayRequest = {
  id: string;
  agentId: string;
  toolPassportId: string;
  action: string;
  resource: string;
  destination: string;
  dataClasses: ToolAssignment["dataClasses"];
  transactionUsd?: number;
};

type EvaluationInput = {
  request: GatewayRequest;
  agent: AgentIdentity;
  passport: ToolPassport;
  assignment?: ToolAssignment;
  now?: string;
};

function matches(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.endsWith("*")) return pattern === value;
  return value.startsWith(pattern.slice(0, -1));
}

function anyMatch(patterns: string[], value: string): boolean {
  return patterns.some((pattern) => matches(pattern, value));
}

export async function evaluateRequest(input: EvaluationInput): Promise<GatewayDecision> {
  const now = input.now ?? new Date().toISOString();
  const { agent, assignment, passport, request } = input;
  const reasons: string[] = [];

  if (agent.status !== "active") reasons.push("AGENT_NOT_ACTIVE");
  if (passport.status !== "active") reasons.push("TOOL_PASSPORT_NOT_ACTIVE");
  if (new Date(agent.expiresAt) <= new Date(now)) reasons.push("AGENT_IDENTITY_EXPIRED");
  if (new Date(passport.expiresAt) <= new Date(now)) reasons.push("TOOL_PASSPORT_EXPIRED");

  if (!assignment) {
    reasons.push("ASSIGNMENT_MISSING");
  } else {
    if (assignment.status !== "active") reasons.push("ASSIGNMENT_NOT_ACTIVE");
    if (assignment.agentId !== request.agentId) reasons.push("ASSIGNMENT_AGENT_MISMATCH");
    if (assignment.toolPassportId !== request.toolPassportId) reasons.push("ASSIGNMENT_TOOL_MISMATCH");
    if (new Date(assignment.expiresAt) <= new Date(now)) reasons.push("ASSIGNMENT_EXPIRED");
    if (!anyMatch(assignment.allowedActions, request.action)) reasons.push("ACTION_NOT_ASSIGNED");
    if (assignment.resourcePatterns.length > 0 && !anyMatch(assignment.resourcePatterns, request.resource)) reasons.push("RESOURCE_NOT_ASSIGNED");
    if (assignment.destinations.length > 0 && !anyMatch(assignment.destinations, request.destination)) reasons.push("DESTINATION_NOT_ASSIGNED");
    if (assignment.dataClasses.length > 0 && request.dataClasses.some((item) => !assignment.dataClasses.includes(item))) reasons.push("DATA_CLASS_NOT_ASSIGNED");
  }

  const denied = agent.authority.deny.some((rule) => (
    matches(rule.action, request.action)
    && (rule.resources.length === 0 || anyMatch(rule.resources, request.resource))
    && (rule.destinations.length === 0 || anyMatch(rule.destinations, request.destination))
  ));
  if (denied) reasons.push("SEMANTIC_DENY_MATCHED");

  const allowed = agent.authority.allow.some((rule) => (
    matches(rule.action, request.action)
    && (rule.resources.length === 0 || anyMatch(rule.resources, request.resource))
    && (rule.destinations.length === 0 || anyMatch(rule.destinations, request.destination))
    && request.dataClasses.every((item) => rule.dataClasses.length === 0 || rule.dataClasses.includes(item))
  ));
  if (!allowed) reasons.push("OUTSIDE_SEMANTIC_AUTHORITY");

  if (agent.authority.permittedRoots.length > 0 && !anyMatch(agent.authority.permittedRoots, request.resource)) {
    reasons.push("OUTSIDE_PERMITTED_ROOT");
  }

  if (
    request.transactionUsd !== undefined
    && agent.authority.maxTransactionUsd !== undefined
    && request.transactionUsd > agent.authority.maxTransactionUsd
  ) reasons.push("TRANSACTION_LIMIT_EXCEEDED");

  const policyDigest = await sha256({
    authority: agent.authority,
    assignment: assignment ?? null,
    passport: {
      id: passport.id,
      artifactDigest: passport.artifactDigest,
      status: passport.status,
    },
  });

  return gatewayDecisionSchema.parse({
    contractVersion,
    id: `decision:${request.id}`,
    requestId: request.id,
    agentId: request.agentId,
    toolPassportId: request.toolPassportId,
    assignmentId: assignment?.id,
    verdict: reasons.length === 0 ? "ALLOW" : "BLOCK",
    reasonCodes: reasons.length === 0 ? ["POLICY_INTERSECTION_SATISFIED"] : reasons,
    evaluatedAt: now,
    policyDigest,
  });
}
