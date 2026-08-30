import assert from "node:assert/strict";
import test from "node:test";
import { scanManifest } from "../src/scanner/scanManifest";
import { safeManifest } from "../src/scanner/fixtures";
import {
  evaluateStampIssuance,
  requireStampIssuanceEligibility,
  type StampReview,
} from "../src/stamps/evaluateStampIssuance";

const assessedAt = "2026-08-29T12:00:00.000Z";
const reviewedAt = "2026-08-29T12:01:00.000Z";
const evaluatedAt = "2026-08-29T12:02:00.000Z";

const approvedReview: StampReview = {
  status: "approved",
  reviewerId: "reviewer:flint-security",
  reviewedAt,
  evidenceRefs: ["evidence:assessment-demo-001"],
};

test("permits the issuance path only after a complete production PASS and review", async () => {
  const report = await scanManifest({ ...safeManifest, environment: "production" }, { now: assessedAt });
  const decision = await evaluateStampIssuance(report, approvedReview, { now: evaluatedAt });

  assert.equal(decision.eligible, true);
  assert.deepEqual(decision.reasonCodes, ["STAMP_ISSUANCE_REQUIREMENTS_SATISFIED"]);
  await assert.doesNotReject(() => requireStampIssuanceEligibility(report, approvedReview, { now: evaluatedAt }));
});

test("blocks a passing demo assessment from receiving a production Stamp", async () => {
  const report = await scanManifest(safeManifest, { now: assessedAt });
  const decision = await evaluateStampIssuance(report, approvedReview, { now: evaluatedAt });

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("ENVIRONMENT_NOT_ALLOWED"));
  await assert.rejects(() => requireStampIssuanceEligibility(report, approvedReview, { now: evaluatedAt }));
});

test("blocks issuance when review approval or scanner coverage is incomplete", async () => {
  const report = await scanManifest(
    { ...safeManifest, environment: "production" },
    { now: assessedAt, disabledChecks: ["AGT-C003_TEXT_RISK_RULES"] },
  );
  const decision = await evaluateStampIssuance(
    report,
    { ...approvedReview, status: "pending" },
    { now: evaluatedAt },
  );

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("ASSESSMENT_NOT_PASS"));
  assert.ok(decision.reasonCodes.includes("ASSESSMENT_COVERAGE_INCOMPLETE"));
  assert.ok(decision.reasonCodes.includes("REVIEW_APPROVAL_REQUIRED"));
});
