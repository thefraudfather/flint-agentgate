import { sha256 } from "../domain/canonicalize";
import { riskCatalog, severityWeight } from "./riskCatalog";

export const assessmentPolicyId = "flint.agentgate.assessment-policy";
export const assessmentPolicyVersion = "0.1.0";
export const maxManifestBytes = 256_000;

export const assessmentChecks = [
  { id: "AGT-C001_CONTRACT_VALIDATION", version: "0.1.0", detail: "Validate the closed artifact manifest contract." },
  { id: "AGT-C002_CANONICAL_DIGEST", version: "0.1.0", detail: "Bind the assessment to a canonical SHA-256 artifact digest." },
  { id: "AGT-C003_TEXT_RISK_RULES", version: "0.1.0", detail: "Inspect declared text surfaces with stable FLINT risk rules." },
  { id: "AGT-C004_DECLARATION_CONTROLS", version: "0.1.0", detail: "Inspect schemas, annotations, capabilities, and destinations." },
  { id: "AGT-C005_TOXIC_COMBINATIONS", version: "0.1.0", detail: "Identify unsafe combinations of untrusted input and sensitive authority." },
] as const;

export type AssessmentCheckId = typeof assessmentChecks[number]["id"];

const policyDefinition = {
  id: assessmentPolicyId,
  version: assessmentPolicyVersion,
  maxManifestBytes,
  checks: assessmentChecks,
  verdictRules: {
    criticalOrHigh: "FAIL",
    mediumOrLow: "CONDITIONAL",
    noFindingsWithCompleteCoverage: "PASS",
    incompleteCoverage: "CONDITIONAL",
    scannerFailure: "ERROR",
  },
  severityWeight,
  riskRules: riskCatalog.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    patterns: rule.patterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })),
  })),
};

export async function assessmentPolicyRecord() {
  return {
    id: assessmentPolicyId,
    version: assessmentPolicyVersion,
    digest: await sha256(policyDefinition),
  };
}
