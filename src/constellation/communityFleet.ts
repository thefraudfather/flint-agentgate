import type { GatewayDecision, ObservedAgent } from "../domain/contracts";

export type CommunityFleetTone = "local" | "governed" | "allow" | "review" | "block" | "revoked";

export type CommunityFleetAgent = {
  id: string;
  code: string;
  name: string;
  tool: string;
  scope: string[];
  mandate: string;
  source: "instrumented-demo" | "local-sample";
  assurance: "community-self-attested";
  stateLabel: string;
  tone: CommunityFleetTone;
  orbit: {
    radiusX: number;
    radiusY: number;
    periodSeconds: number;
    phase: number;
  };
};

export type CommunityFleetInput = {
  primaryName: string;
  primaryTool: string;
  primaryScope: string[];
  primaryMandate: string;
  lifecycleState: ObservedAgent["state"];
  assignmentActive: boolean;
  verdict?: GatewayDecision["verdict"];
  revoked: boolean;
};

export function derivePrimaryTone(input: Pick<CommunityFleetInput, "assignmentActive" | "lifecycleState" | "revoked" | "verdict">): CommunityFleetTone {
  if (input.revoked) return "revoked";
  if (input.verdict === "ALLOW") return "allow";
  if (input.verdict === "BLOCK") return "block";
  if (input.verdict === "REVIEW" || input.verdict === "STEP_UP") return "review";
  if (input.assignmentActive || input.lifecycleState === "governed") return "governed";
  return "local";
}

export function buildCommunityFleet(input: CommunityFleetInput): CommunityFleetAgent[] {
  const primaryTone = derivePrimaryTone(input);
  const primaryState = input.revoked
    ? "TOOL REMOVED"
    : input.verdict ?? (input.assignmentActive ? "GOVERNED" : input.lifecycleState.toUpperCase());

  return [
    {
      id: "primary-demo-agent",
      code: "PA",
      name: input.primaryName,
      tool: input.primaryTool,
      scope: input.primaryScope,
      mandate: input.primaryMandate,
      source: "instrumented-demo",
      assurance: "community-self-attested",
      stateLabel: primaryState,
      tone: primaryTone,
      orbit: { radiusX: 0.28, radiusY: 0.23, periodSeconds: 25, phase: 0.35 },
    },
    {
      id: "invoice-reconciler",
      code: "IR",
      name: "Invoice Reconciler",
      tool: "invoice.match",
      scope: ["invoice:read", "purchase-order:read"],
      mandate: "Match invoices to approved purchase orders. Payment release is excluded.",
      source: "local-sample",
      assurance: "community-self-attested",
      stateLabel: "LOCAL DECLARATION",
      tone: "local",
      orbit: { radiusX: 0.38, radiusY: 0.31, periodSeconds: 34, phase: 2.2 },
    },
    {
      id: "vendor-intake-reviewer",
      code: "VI",
      name: "Vendor Intake Reviewer",
      tool: "vendor.screen",
      scope: ["vendor:read", "risk-note:write"],
      mandate: "Review submitted vendor records and draft a risk note. Approval is excluded.",
      source: "local-sample",
      assurance: "community-self-attested",
      stateLabel: "LOCAL DECLARATION",
      tone: "local",
      orbit: { radiusX: 0.33, radiusY: 0.39, periodSeconds: 30, phase: 4.05 },
    },
    {
      id: "contract-indexer",
      code: "CI",
      name: "Contract Indexer",
      tool: "contract.index",
      scope: ["contract:read", "index:write"],
      mandate: "Index approved contract text. External publication and contract changes are excluded.",
      source: "local-sample",
      assurance: "community-self-attested",
      stateLabel: "LOCAL DECLARATION",
      tone: "local",
      orbit: { radiusX: 0.43, radiusY: 0.2, periodSeconds: 39, phase: 5.3 },
    },
    {
      id: "policy-monitor",
      code: "PM",
      name: "Policy Monitor",
      tool: "policy.compare",
      scope: ["policy:read", "alert:create"],
      mandate: "Compare approved policy versions and create review alerts. Policy edits are excluded.",
      source: "local-sample",
      assurance: "community-self-attested",
      stateLabel: "LOCAL DECLARATION",
      tone: "local",
      orbit: { radiusX: 0.22, radiusY: 0.43, periodSeconds: 28, phase: 3.05 },
    },
  ];
}
