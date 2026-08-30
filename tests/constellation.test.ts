import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityFleet, derivePrimaryTone } from "../src/constellation/communityFleet";

test("community fleet keeps every rendered node self-attested", () => {
  const fleet = buildCommunityFleet({
    primaryName: "Procurement Analyst",
    primaryTool: "catalog.lookup",
    primaryScope: ["catalog:read"],
    primaryMandate: "Compare approved catalog products without purchasing.",
    lifecycleState: "observed",
    assignmentActive: false,
    revoked: false,
  });

  assert.equal(fleet.length, 5);
  assert.equal(fleet.filter((agent) => agent.source === "instrumented-demo").length, 1);
  assert.ok(fleet.every((agent) => agent.assurance === "community-self-attested"));
});

test("primary fleet tone follows the runtime decision and revocation boundary", () => {
  assert.equal(derivePrimaryTone({ lifecycleState: "observed", assignmentActive: false, revoked: false }), "local");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, revoked: false }), "governed");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, verdict: "ALLOW", revoked: false }), "allow");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, verdict: "BLOCK", revoked: false }), "block");
  assert.equal(derivePrimaryTone({ lifecycleState: "governed", assignmentActive: true, verdict: "ALLOW", revoked: true }), "revoked");
});
