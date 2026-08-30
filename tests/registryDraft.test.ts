import assert from "node:assert/strict";
import test from "node:test";
import { LocalTrustProvider } from "../src/providers/localTrustProvider";
import { AssignmentRejectedError } from "../src/registry/assignmentPolicy";
import {
  createDefaultRegistryDraft,
  registerRegistryDraft,
} from "../src/registry/demoRegistry";
import { safeManifest } from "../src/scanner/fixtures";

const now = "2026-08-30T12:00:00.000Z";

async function issueCredential() {
  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(safeManifest, { now });
  await provider.assessArtifact(submission.artifactVersion.id, { now });
  const credential = await provider.issueToolPassport(submission.artifactVersion.id, safeManifest.tools[0].name, { now });
  return { provider, credential };
}

async function issueCustomCredential() {
  const manifest = structuredClone(safeManifest);
  manifest.artifact.id = "artifact:weather-lookup";
  manifest.artifact.name = "Weather Lookup";
  manifest.artifact.sourceUri = "https://example.com/weather-lookup";
  manifest.tools[0].name = "weather.lookup";
  manifest.tools[0].title = "Weather lookup";
  manifest.tools[0].description = "Read the current forecast for an approved city.";
  manifest.tools[0].capabilities = ["weather:read"];
  manifest.tools[0].destinations = ["api.weather.example"];

  const provider = new LocalTrustProvider();
  const submission = await provider.submitArtifact(manifest, { now });
  await provider.assessArtifact(submission.artifactVersion.id, { now });
  const credential = await provider.issueToolPassport(submission.artifactVersion.id, manifest.tools[0].name, { now });
  return credential;
}

test("editable registry draft creates separate identity and semantic records", async () => {
  const { provider, credential } = await issueCredential();
  const draft = createDefaultRegistryDraft(credential);
  draft.organization.displayName = "Mesa Field Services";
  draft.principal.displayName = "Operations Director";
  draft.agent.displayName = "Parts Research Agent";
  draft.authority.purpose = "Compare approved replacement parts for field technicians.";

  const context = await registerRegistryDraft(provider, credential, draft);
  const snapshot = provider.registry.snapshot();

  assert.equal(context.organization.displayName, "Mesa Field Services");
  assert.equal(context.agentPassport.displayName, "Parts Research Agent");
  assert.equal(context.authorityGrant.purpose, draft.authority.purpose);
  assert.notEqual(context.agentPassport.id, context.authorityGrant.id);
  assert.equal(snapshot.organizations.length, 1);
  assert.equal(snapshot.agentPassports.length, 1);
  assert.equal(snapshot.capabilityClaims.length, 1);
  assert.equal(snapshot.authorityGrants.length, 1);
  assert.equal(snapshot.toolContracts.length, 1);
  assert.equal(snapshot.assignments.length, 0);
});

test("registry draft preflight rejects assignment expansion before identity mutation", async () => {
  const { provider, credential } = await issueCredential();
  const draft = createDefaultRegistryDraft(credential);
  draft.assignment.resources = ["file://C:/outside/*"];

  await assert.rejects(
    () => registerRegistryDraft(provider, credential, draft),
    (error: unknown) => error instanceof AssignmentRejectedError
      && error.reasonCodes.includes("RESOURCE_EXPANDS_AUTHORITY")
      && error.reasonCodes.includes("ACTION_EXPANDS_CAPABILITY"),
  );

  const snapshot = provider.registry.snapshot();
  assert.equal(snapshot.organizations.length, 0);
  assert.equal(snapshot.principals.length, 0);
  assert.equal(snapshot.agentPassports.length, 0);
  assert.equal(snapshot.authorityGrants.length, 0);
  assert.equal(snapshot.assignments.length, 0);
});

test("registry draft rejects malformed agent fingerprints before identity mutation", async () => {
  const { provider, credential } = await issueCredential();
  const draft = createDefaultRegistryDraft(credential);
  draft.agent.fingerprint = "not-a-digest";

  await assert.rejects(() => registerRegistryDraft(provider, credential, draft));
  assert.equal(provider.registry.snapshot().agentPassports.length, 0);
});

test("custom tools receive neutral registry defaults instead of catalog demo authority", async () => {
  const credential = await issueCustomCredential();
  const draft = createDefaultRegistryDraft(credential);

  assert.equal(draft.agent.id, "agent-passport:weather-lookup");
  assert.equal(draft.agent.displayName, "Weather Lookup Agent");
  assert.deepEqual(draft.capability.resources, ["tool://weather-lookup/*"]);
  assert.deepEqual(draft.authority.permittedRoots, ["tool://weather-lookup/*"]);
  assert.equal(draft.authority.purpose, "Use weather.lookup within its declared scope.");
  assert.deepEqual(draft.authority.deniedActions, []);
  assert.deepEqual(draft.authority.conditions, []);
});
