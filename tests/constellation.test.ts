import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityFleet, derivePrimaryTone } from "../src/constellation/communityFleet";

test("community fleet distinguishes declarations, valid passport samples, and drift samples", () => {
  const fleet = buildCommunityFleet({
    primaryName: "Procurement Analyst",
    primaryTool: "catalog.lookup",
    primaryScope: ["catalog:read"],
    primaryMandate: "Compare approved catalog products without purchasing.",
    lifecycleState: "observed",
    assignmentActive: false,
    revoked: false,
  });

  assert.equal(fleet.length, 7);
  assert.equal(fleet.filter((agent) => agent.source === "instrumented-demo").length, 1);
  assert.equal(fleet.filter((agent) => agent.source === "flint-valid-sample").length, 2);
  assert.equal(fleet.filter((agent) => agent.source === "drift-alert-sample").length, 2);
  assert.equal(fleet.filter((agent) => agent.assurance === "flint-passport-valid-sample").length, 2);
  assert.equal(fleet.filter((agent) => agent.assurance === "mandate-drift-sample").length, 2);
  assert.ok(fleet.filter((agent) => agent.source === "flint-valid-sample").every((agent) => agent.tone === "allow"));
  assert.ok(fleet.filter((agent) => agent.source === "drift-alert-sample").every((agent) => agent.tone === "block"));
});

test("primary fleet tone follows the runtime decision and revocation boundary", () => {
  assert.equal(derivePrimaryTone({ lifecycleState: "observed", assignmentActive: false, revoked: false }), "local");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, revoked: false }), "governed");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, verdict: "ALLOW", revoked: false }), "allow");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, verdict: "BLOCK", revoked: false }), "block");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, verdict: "ALLOW", revoked: true }), "revoked");
});
