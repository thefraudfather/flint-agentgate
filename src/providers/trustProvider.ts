import type {
  ArtifactManifest,
  ArtifactVersion,
  AssessmentReport,
  PublisherPassport,
  ToolPassportCredential,
} from "../domain/contracts";
import type { CommunityCredentialVerification } from "../credentials/communityIssuer";

export type SubmissionResult = {
  publisherPassport: PublisherPassport;
  artifactVersion: ArtifactVersion;
};

export interface TrustProvider {
  readonly id: string;
  readonly mode: "community-local" | "flint-command";
  submitArtifact(manifest: ArtifactManifest, options?: { now?: string }): Promise<SubmissionResult>;
  assessArtifact(artifactVersionId: string, options?: { now?: string }): Promise<AssessmentReport>;
  issueToolPassport(artifactVersionId: string, toolName: string, options?: { now?: string }): Promise<ToolPassportCredential>;
  verifyToolPassport(credential: unknown, options?: { now?: string }): Promise<CommunityCredentialVerification>;
}
