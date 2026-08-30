import assert from "node:assert/strict";
import test from "node:test";
import type { GatewayDecision } from "../src/domain/contracts";
import { summarizeGatewayDecision } from "../src/gateway/decisionCopy";

function summarize(verdict: GatewayDecision["verdict"], ...reasonCodes: string[]): string {
  return summarizeGatewayDecision({ verdict, reasonCodes });
}

test("summarizes allow, review, and step-up decisions", () => {
  assert.equal(
    summarize("ALLOW", "POLICY_INTERSECTION_SATISFIED"),
    "The agent, tool credential, assignment, and request all match.",
  );
  assert.equal(
    summarize("REVIEW", "SEMANTIC_PROVIDER_ERROR"),
    "AgentGate needs review before this request can continue.",
  );
  assert.equal(
    summarize("STEP_UP", "ADDITIONAL_PROOF_REQUIRED"),
    "AgentGate needs more proof before this request can continue.",
  );
});

test("explains common block reasons in plain language", () => {
  const cases: Array<[string, string]> = [
    ["SEMANTIC_INTENT_DRIFT_DETECTED", "The request falls outside the agent's approved purpose."],
    ["RESOURCE_OUTSIDE_TOOL_CONTRACT", "The requested resource is outside this agent's approved scope."],
    ["DESTINATION_NOT_ASSIGNED", "The requested destination is outside this agent's approved scope."],
    ["DATA_CLASS_OUTSIDE_TOOL_CONTRACT", "The request uses data this agent or tool is not approved to handle."],
    ["SIDE_EFFECT_NOT_ASSIGNED", "The request would cause an effect outside the approved scope."],
    ["ACTION_NOT_ASSIGNED", "The requested action is not approved for this agent and tool."],
    ["TRANSACTION_LIMIT_EXCEEDED", "The transaction amount exceeds the agent's approved limit."],
    ["ASSIGNMENT_EXPIRED", "A required identity, credential, or assignment has expired."],
  ];

  for (const [reason, expected] of cases) assert.equal(summarize("BLOCK", reason), expected);
});

test("uses a safe generic explanation for unknown block reasons", () => {
  assert.equal(
    summarize("BLOCK", "UNKNOWN_POLICY_FAILURE"),
    "AgentGate blocked this request because it did not satisfy the active policy.",
  );
});
