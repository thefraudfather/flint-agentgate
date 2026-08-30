import {
  artifactManifestSchema,
  artifactVersionSchema,
  contractVersion,
  publisherPassportSchema,
  type ArtifactManifest,
  type ArtifactVersion,
  type PublisherPassport,
} from "../domain/contracts";
import { sha256 } from "../domain/canonicalize";

const publisherPassportLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export async function createPublisherIntake(
  input: unknown,
  options: { now?: string; issuerId?: string } = {},
): Promise<{ publisherPassport: PublisherPassport; artifactVersion: ArtifactVersion }> {
  const manifest: ArtifactManifest = artifactManifestSchema.parse(input);
  const submittedAt = options.now ?? new Date().toISOString();
  const issuerId = options.issuerId ?? "community:local";
  const digest = await sha256(manifest);

  const publisherPassport = publisherPassportSchema.parse({
    contractVersion,
    id: `publisher-passport:${manifest.publisher.id}`,
    publisherId: manifest.publisher.id,
    organizationId: manifest.publisher.organizationId,
    displayName: manifest.publisher.displayName,
    assuranceLevel: "community-self-attested",
    issuerId,
    status: "active",
    issuedAt: submittedAt,
    expiresAt: addMilliseconds(submittedAt, publisherPassportLifetimeMs),
  });

  const artifactVersion = artifactVersionSchema.parse({
    contractVersion,
    id: `artifact-version:${digest.slice(7, 23)}`,
    artifactId: manifest.artifact.id,
    version: manifest.artifact.version,
    digest,
    publisherPassportId: publisherPassport.id,
    submittedAt,
    manifest,
  });

  return {
    publisherPassport: deepFreeze(publisherPassport),
    artifactVersion: deepFreeze(artifactVersion),
  };
}
