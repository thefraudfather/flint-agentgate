import assert from "node:assert/strict";
import test from "node:test";
import { toolPassportCredentialSchema, toolPassportSchema } from "../src/domain/contracts";
import { safeManifest, riskyManifest } from "../src/scanner/fixtures";
import { communityScanner } from "../src/scanner/communityScanner";
import { LocalTrustProvider } from "../src/providers/localTrustProvider";

const submittedAt = "2026-08-30T12:00:00.000Z";
const verifiedAt = "2026-08-30T12:05:00.000Z";

test("community scanner publishes an explicit read-only adapter boundary", () => {
  assert.equal(communityScanner.descriptor.requiresCredential, false);
  assert.equal(communityScanner.descriptor.executesSubmittedCode, false);
  assert.equal(communityScanner.descriptor.executionMode, "in-process-read-only");
});

test("local provider creates an immutable artifact version and self-attested Tool Passport", async () => {
  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(safeManifest, { now: submittedAt });
  const report = await provider.assessArtifact(submission.artifactVersion.id, { now: submittedAt });
  const credential = await provider.issueToolPassport(
    submission.artifactVersion.id,
    safeManifest.tools[0].name,
    { now: submittedAt },
  );
  const verification = await provider.verifyToolPassport(credential, { now: verifiedAt });

  assert.equal(Object.isFrozen(submission.artifactVersion), true);
  assert.equal(Object.isFrozen(submission.artifactVersion.manifest), true);
  assert.equal(submission.artifactVersion.digest, report.artifactDigest);
  assert.equal(toolPassportCredentialSchema.parse(credential).passport.assuranceLevel, "community-self-attested");
  assert.equal(credential.passport.stampId, undefined);
  assert.equal(verification.integrityValid, true);
  assert.equal(verification.current, true);
  assert.equal(verification.flintVerified, false);
});

test("tampering invalidates a community credential signature", async () => {
  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(safeManifest, { now: submittedAt });
  await provider.assessArtifact(submission.artifactVersion.id, { now: submittedAt });
  const credential = await provider.issueToolPassport(submission.artifactVersion.id, safeManifest.tools[0].name, { now: submittedAt });
  const tampered = {
    ...credential,
    passport: { ...credential.passport, artifactVersion: "9.9.9-tampered" },
  };
  const verification = await provider.verifyToolPassport(tampered, { now: verifiedAt });

  assert.equal(verification.integrityValid, false);
  assert.ok(verification.reasonCodes.includes("COMMUNITY_SIGNATURE_INVALID"));
});

test("resubmitting changed content creates a distinct immutable artifact version", async () => {
  const provider = new LocalTrustProvider();
  const first = await provider.submitArtifact(safeManifest, { now: submittedAt });
  const second = await provider.submitArtifact({
    ...safeManifest,
    artifact: { ...safeManifest.artifact, version: "1.4.3-demo" },
  }, { now: verifiedAt });

  assert.notEqual(first.artifactVersion.id, second.artifactVersion.id);
  assert.notEqual(first.artifactVersion.digest, second.artifactVersion.digest);
  assert.equal(provider.snapshot().artifactVersions.length, 2);
});

test("a failed assessment cannot issue a community Tool Passport", async () => {
  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(riskyManifest, { now: submittedAt });
  const report = await provider.assessArtifact(submission.artifactVersion.id, { now: submittedAt });

  assert.equal(report.verdict, "FAIL");
  await assert.rejects(
    () => provider.issueToolPassport(submission.artifactVersion.id, riskyManifest.tools[0].name, { now: submittedAt }),
    /requires a complete PASS/,
  );
});

test("community credentials cannot claim the FLINT-verified assurance level", () => {
  assert.throws(() => toolPassportSchema.parse({
    contractVersion: "agentgate.v0",
    id: "tool-passport:forged",
    assuranceLevel: "community-self-attested",
    issuerId: "community:local",
    toolName: "catalog.lookup",
    artifactId: "artifact:catalog-lookup",
    artifactVersion: "1.0.0",
    artifactDigest: `sha256:${"a".repeat(64)}`,
    assessmentId: "assessment:forged",
    stampId: "stamp:forged",
    capabilities: ["catalog:read"],
    dataClasses: ["public"],
    destinations: ["catalog.example"],
    issuedAt: submittedAt,
    expiresAt: "2026-09-30T12:00:00.000Z",
    status: "active",
  }));
});
