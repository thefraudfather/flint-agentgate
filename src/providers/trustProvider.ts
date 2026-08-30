import type {
  ArtifactManifest,
  ArtifactVersion,
  AssessmentReport,
  PublisherPassport,
  ToolPassportCredential,
} from "../domain/contracts";
import type { CommunityCredentialVerification } from "../credentials/communityIssuer";
import type { AssignmentRequest } from "../registry/assignmentPolicy";
import type { ResolvedAssignment } from "../registry/identityRegistry";

export type SubmissionResult = {
  publisherPassport: PublisherPassport;
  artifactVersion: ArtifactVersion;
};

export type RegistryAssignmentInput = {
  agentPassportId: string;
  capabilityClaimId: string;
  authorityGrantId: string;
  toolPassportId: string;
  toolContractId: string;
  request: AssignmentRequest;
  now?: string;
};

export interface TrustProvider {
  readonly id: string;
  readonly mode: "community-local" | "flint-command";
  submitArtifact(manifest: ArtifactManifest, options?: { now?: string }): Promise<SubmissionResult>;
  assessArtifact(artifactVersionId: string, options?: { now?: string }): Promise<AssessmentReport>;
  issueToolPassport(artifactVersionId: string, toolName: string, options?: { now?: string }): Promise<ToolPassportCredential>;
  verifyToolPassport(credential: unknown, options?: { now?: string }): Promise<CommunityCredentialVerification>;
  createAssignment(input: RegistryAssignmentInput): Promise<ResolvedAssignment["assignment"]>;
  resolveAssignment(assignmentId: string, options?: { now?: string }): ResolvedAssignment;
  freezeAgent(agentPassportId: string): void;
  revokeToolPassport(toolPassportId: string): void;
}
