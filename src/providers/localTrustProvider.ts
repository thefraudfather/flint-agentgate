import {
  createCommunityIssuer,
  issueCommunityInvocationEvidence,
  issueCommunityToolPassport,
  verifyCommunityToolPassport,
  type CommunityIssuer,
} from "../credentials/communityIssuer";
import {
  contractVersion,
  invocationEvidenceSchema,
  type InvocationEvidence,
  type ArtifactManifest,
  type ArtifactVersion,
  type AssessmentReport,
  type ToolPassportCredential,
} from "../domain/contracts";
import { createPublisherIntake } from "../registry/publisherIntake";
import { IdentityRegistry } from "../registry/identityRegistry";
import { communityScanner } from "../scanner/communityScanner";
import type { ScannerAdapter } from "../scanner/adapter";
import type { RegistryAssignmentInput, SubmissionResult, TrustProvider } from "./trustProvider";
import { evaluateResolvedInvocation, type GatewayInvocationRequest, type SemanticIntegrityProvider } from "../gateway/runtimeGateway";

export class LocalTrustProvider implements TrustProvider {
  readonly id = "flint.agentgate.community-local";
  readonly mode = "community-local" as const;
  readonly scanner: ScannerAdapter;
  readonly registry = new IdentityRegistry();

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
    const verification = await verifyCommunityToolPassport(credential, { now: options.now });
    this.registry.registerToolCredential(credential, verification);
    return credential;
  }

  verifyToolPassport(credential: unknown, options: { now?: string } = {}) {
    return verifyCommunityToolPassport(credential, options);
  }

  createAssignment(input: RegistryAssignmentInput) {
    return this.registry.createAssignment(input);
  }

  resolveAssignment(assignmentId: string, options: { now?: string } = {}) {
    return this.registry.resolveAssignment(assignmentId, options);
  }

  async evaluateInvocation(
    request: GatewayInvocationRequest,
    options: { now?: string; semanticProvider?: SemanticIntegrityProvider } = {},
  ) {
    const resolved = this.registry.resolveAssignment(request.assignmentId, { now: options.now });
    const issuer = await this.#getIssuer();
    const { decision, inputDigest } = await evaluateResolvedInvocation({
      request,
      resolved,
      semanticProvider: options.semanticProvider,
      now: options.now,
    });
    const evidence: InvocationEvidence = invocationEvidenceSchema.parse({
      contractVersion,
      id: `invocation-evidence:${request.id}`,
      requestId: request.id,
      decisionId: decision.id,
      organizationId: resolved.assignment.organizationId,
      issuerId: issuer.issuerId,
      agentId: resolved.agentPassport.id,
      toolPassportId: resolved.credential.passport.id,
      artifactDigest: resolved.credential.passport.artifactDigest,
      capabilityClaimId: resolved.capabilityClaim.id,
      capabilityClaimVersion: resolved.capabilityClaim.version,
      semanticAuthorityGrantId: resolved.authorityGrant.id,
      semanticAuthorityGrantVersion: resolved.authorityGrant.version,
      toolSemanticContractId: resolved.toolContract.id,
      toolSemanticContractVersion: resolved.toolContract.version,
      assignmentId: resolved.assignment.id,
      action: request.action,
      resource: request.resource,
      destination: request.destination,
      inputDigest,
      policyDigest: decision.policyDigest,
      verdict: decision.verdict,
      reasonCodes: decision.reasonCodes,
      outcome: decision.verdict === "ALLOW" ? "allowed" : "blocked",
      occurredAt: decision.evaluatedAt,
    });
    return {
      decision,
      evidenceCredential: await issueCommunityInvocationEvidence({ issuer, evidence }),
    };
  }

  freezeAgent(agentPassportId: string) {
    this.registry.freezeAgent(agentPassportId);
  }

  revokeToolPassport(toolPassportId: string) {
    this.registry.revokeToolPassport(toolPassportId);
  }

  snapshot() {
    return {
      artifactVersions: [...this.#artifactVersions.values()],
      assessments: [...this.#assessments.values()],
      credentials: [...this.#credentials.values()],
      registry: this.registry.snapshot(),
    };
  }
}
