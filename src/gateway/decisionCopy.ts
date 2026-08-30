import type { GatewayDecision } from "../domain/contracts";

type DecisionSummaryInput = Pick<GatewayDecision, "verdict" | "reasonCodes">;

export function summarizeGatewayDecision(decision: DecisionSummaryInput): string {
  if (decision.verdict === "ALLOW") {
    return "The agent, tool credential, assignment, and request all match.";
  }
  if (decision.verdict === "REVIEW") {
    return "AgentGate needs review before this request can continue.";
  }
  if (decision.verdict === "STEP_UP") {
    return "AgentGate needs more proof before this request can continue.";
  }

  const reasons = new Set(decision.reasonCodes);
  if (
    reasons.has("SEMANTIC_INTENT_DRIFT_DETECTED")
    || reasons.has("SEMANTIC_DENY_MATCHED")
    || reasons.has("OUTSIDE_SEMANTIC_AUTHORITY")
  ) return "The request falls outside the agent's approved purpose.";
  if (decision.reasonCodes.some((reason) => reason.startsWith("RESOURCE_") || reason === "OUTSIDE_PERMITTED_ROOT")) {
    return "The requested resource is outside this agent's approved scope.";
  }
  if (decision.reasonCodes.some((reason) => reason.startsWith("DESTINATION_"))) {
    return "The requested destination is outside this agent's approved scope.";
  }
  if (decision.reasonCodes.some((reason) => reason.startsWith("DATA_CLASS_"))) {
    return "The request uses data this agent or tool is not approved to handle.";
  }
  if (decision.reasonCodes.some((reason) => reason.startsWith("SIDE_EFFECT_"))) {
    return "The request would cause an effect outside the approved scope.";
  }
  if (decision.reasonCodes.some((reason) => reason.startsWith("ACTION_"))) {
    return "The requested action is not approved for this agent and tool.";
  }
  if (reasons.has("TRANSACTION_LIMIT_EXCEEDED")) {
    return "The transaction amount exceeds the agent's approved limit.";
  }
  if (decision.reasonCodes.some((reason) => reason.endsWith("_EXPIRED"))) {
    return "A required identity, credential, or assignment has expired.";
  }

  return "AgentGate blocked this request because it did not satisfy the active policy.";
}
