import assert from "node:assert/strict";
import test from "node:test";
import { safeManifest, riskyManifest } from "../src/scanner/fixtures";
import { scanManifest } from "../src/scanner/scanManifest";

const now = "2026-08-29T12:00:00.000Z";

test("returns a deterministic PASS for the bounded read-only fixture", async () => {
  const first = await scanManifest(safeManifest, { now });
  const second = await scanManifest(safeManifest, { now });

  assert.equal(first.verdict, "PASS");
  assert.equal(first.score, 100);
  assert.equal(first.artifactDigest, second.artifactDigest);
  assert.deepEqual(first.findings, []);
});

test("blocks a toxic combination and preserves stable risk identifiers", async () => {
  const report = await scanManifest(riskyManifest, { now });
  const risks = new Set(report.findings.map((finding) => finding.riskId));

  assert.equal(report.verdict, "FAIL");
  assert.ok(risks.has("AGT-R001_PROMPT_INJECTION"));
  assert.ok(risks.has("AGT-R003_PRIVATE_DATA"));
  assert.ok(risks.has("AGT-R004_DESTRUCTIVE_CAPABILITY"));
  assert.ok(risks.has("AGT-R008_OUTBOUND_NETWORK"));
  assert.ok(risks.has("AGT-R009_TOXIC_COMBINATION"));
});

test("rejects malformed manifests before analysis", async () => {
  await assert.rejects(() => scanManifest({ tools: [] }, { now }));
});
