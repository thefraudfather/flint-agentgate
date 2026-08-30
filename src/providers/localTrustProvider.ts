import {
  createCommunityIssuer,
  issueCommunityToolPassport,
  verifyCommunityToolPassport,
  type CommunityIssuer,
} from "../credentials/communityIssuer";
import type {
  ArtifactManifest,
  ArtifactVersion,
  AssessmentReport,
  ToolPassportCredential,
} from "../domain/contracts";
import { createPublisherIntake } from "../registry/publisherIntake";
import { communityScanner } from "../scanner/communityScanner";
import type { ScannerAdapter } from "../scanner/adapter";
import type { SubmissionResult, TrustProvider } from "./trustProvider";

export class LocalTrustProvider implements TrustProvider {
  readonly id = "flint.agentgate.community-local";
  readonly mode = "community-local" as const;
  readonly scanner: ScannerAdapter;

  #issuer?: CommunityIssuer;
  #artifactVersions = new Map<string, ArtifactVersion>();
  #assessments = new Map<string, AssessmentReport>();
  #credentials = new Map<string, ToolPassportCredential>();

  constructor(scanner: ScannerAdapter = communityScanner) {
    this.scanner = scanner;
  }

  async #getIssuer(): Promise<CommunityIssuer> {
    this.#issuer ??= await createCommunityIssuer();
    return this.#issuer;
  }

  async submitArtifact(manifest: ArtifactManifest, options: { now?: string } = {}): Promise<SubmissionResult> {
    const issuer = await this.#getIssuer();
    const result = await createPublisherIntake(manifest, { now: options.now, issuerId: issuer.issuerId });
    this.#artifactVersions.set(result.artifactVersion.id, result.artifactVersion);
    return result;
  }

  async assessArtifact(artifactVersionId: string, options: { now?: string } = {}): Promise<AssessmentReport> {
    const artifactVersion = this.#artifactVersions.get(artifactVersionId);
    if (!artifactVersion) throw new Error("Artifact version is not registered with this provider.");

    const report = await this.scanner.assess(artifactVersion.manifest, options);
    if (report.artifactDigest !== artifactVersion.digest) {
      throw new Error("Scanner output does not match the registered artifact digest.");
    }
    this.#assessments.set(artifactVersionId, report);
    return report;
  }

  async issueToolPassport(
    artifactVersionId: string,
    toolName: string,
    options: { now?: string } = {},
  ): Promise<ToolPassportCredential> {
    const artifactVersion = this.#artifactVersions.get(artifactVersionId);
    const assessment = this.#assessments.get(artifactVersionId);
    if (!artifactVersion || !assessment) throw new Error("Artifact must be submitted and assessed before issuance.");

    const credential = await issueCommunityToolPassport({
      issuer: await this.#getIssuer(),
      artifactVersion,
      assessment,
      toolName,
      now: options.now,
    });
    this.#credentials.set(credential.passport.id, credential);
    return credential;
  }

  verifyToolPassport(credential: unknown, options: { now?: string } = {}) {
    return verifyCommunityToolPassport(credential, options);
  }

  snapshot() {
    return {
      artifactVersions: [...this.#artifactVersions.values()],
      assessments: [...this.#assessments.values()],
      credentials: [...this.#credentials.values()],
    };
  }
}
