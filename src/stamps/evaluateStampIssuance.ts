import { sha256 } from "../domain/canonicalize";
import {
  assessmentReportSchema,
  contractVersion,
  stampIssuanceDecisionSchema,
  type AssessmentReport,
  type StampIssuanceDecision,
} from "../domain/contracts";
import { assessmentPolicyVersion } from "../scanner/assessmentPolicy";
import { scannerVersion } from "../scanner/scanManifest";

export const stampIssuancePolicyId = "flint.agentgate.stamp-issuance-policy";
export const stampIssuancePolicyVersion = "0.1.0";

export type StampReview = {
  status: "approved" | "rejected" | "pending";
  reviewerId: string;
  reviewedAt: string;
  evidenceRefs: string[];
};

type StampIssuanceOptions = {
  now?: string;
  allowedEnvironments?: AssessmentReport["environment"][];
  allowedScannerVersions?: string[];
  allowedAssessmentPolicyVersions?: string[];
  maxAssessmentAgeMs?: number;
};

const defaultMaxAssessmentAgeMs = 24 * 60 * 60 * 1000;

const issuancePolicyDefinition = {
  id: stampIssuancePolicyId,
  version: stampIssuancePolicyVersion,
  requirements: [
    "PASS verdict",
    "complete coverage",
    "all required checks passed",
    "exact-version artifact identity",
    "approved review after assessment",
    "allowed environment",
    "allowed scanner and assessment policy versions",
    "fresh assessment",
  ],
  defaultAllowedEnvironments: ["production"],
  defaultMaxAssessmentAgeMs,
};

export async function evaluateStampIssuance(
  reportInput: AssessmentReport,
  review: StampReview,
  options: StampIssuanceOptions = {},
): Promise<StampIssuanceDecision> {
  const report = assessmentReportSchema.parse(reportInput);
  const evaluatedAt = options.now ?? new Date().toISOString();
  const evaluatedTime = new Date(evaluatedAt).getTime();
  const completedTime = new Date(report.completedAt).getTime();
  const reviewedTime = new Date(review.reviewedAt).getTime();
  const reasons: string[] = [];
  const allowedEnvironments = options.allowedEnvironments ?? ["production"];
  const allowedScannerVersions = options.allowedScannerVersions ?? [scannerVersion];
  const allowedAssessmentPolicyVersions = options.allowedAssessmentPolicyVersions ?? [assessmentPolicyVersion];
  const maxAssessmentAgeMs = options.maxAssessmentAgeMs ?? defaultMaxAssessmentAgeMs;

  if (report.verdict !== "PASS") reasons.push("ASSESSMENT_NOT_PASS");
  if (report.coverage.status !== "complete") reasons.push("ASSESSMENT_COVERAGE_INCOMPLETE");
  if (report.coverage.checks.some((check) => check.status !== "passed")) reasons.push("ASSESSMENT_CHECK_INCOMPLETE");
  if (!report.artifactId || !report.artifactVersion || !report.artifactDigest) reasons.push("ARTIFACT_IDENTITY_INCOMPLETE");
  if (!allowedEnvironments.includes(report.environment)) reasons.push("ENVIRONMENT_NOT_ALLOWED");
  if (!allowedScannerVersions.includes(report.scanner.version)) reasons.push("SCANNER_VERSION_NOT_ALLOWED");
  if (!allowedAssessmentPolicyVersions.includes(report.policy.version)) reasons.push("ASSESSMENT_POLICY_VERSION_NOT_ALLOWED");

  if (review.status === "pending") reasons.push("REVIEW_APPROVAL_REQUIRED");
  if (review.status === "rejected") reasons.push("REVIEW_REJECTED");
  if (!review.reviewerId.trim() || review.evidenceRefs.length === 0) reasons.push("REVIEW_EVIDENCE_INCOMPLETE");
  if (!Number.isFinite(reviewedTime) || reviewedTime < completedTime || reviewedTime > evaluatedTime) {
    reasons.push("REVIEW_TIME_INVALID");
  }

  if (!Number.isFinite(evaluatedTime) || !Number.isFinite(completedTime) || evaluatedTime < completedTime) {
    reasons.push("ASSESSMENT_TIME_INVALID");
  } else if (evaluatedTime - completedTime > maxAssessmentAgeMs) {
    reasons.push("ASSESSMENT_EXPIRED");
  }

  const policyDigest = await sha256(issuancePolicyDefinition);
  const decisionDigest = await sha256({ assessmentId: report.id, evaluatedAt, policyDigest, review });

  return stampIssuanceDecisionSchema.parse({
    contractVersion,
    id: `stamp-decision:${decisionDigest.slice(7, 23)}`,
    assessmentId: report.id,
    artifactDigest: report.artifactDigest,
    eligible: reasons.length === 0,
    reasonCodes: reasons.length === 0 ? ["STAMP_ISSUANCE_REQUIREMENTS_SATISFIED"] : reasons,
    evaluatedAt,
    policyDigest,
  });
}

export async function requireStampIssuanceEligibility(
  report: AssessmentReport,
  review: StampReview,
  options: StampIssuanceOptions = {},
): Promise<StampIssuanceDecision> {
  const decision = await evaluateStampIssuance(report, review, options);
  if (!decision.eligible) {
    throw new Error(`FLINT Stamp issuance blocked: ${decision.reasonCodes.join(", ")}`);
  }
  return decision;
}
