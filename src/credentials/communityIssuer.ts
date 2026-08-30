import { canonicalJson, sha256 } from "../domain/canonicalize";
import {
  assessmentReportSchema,
  contractVersion,
  publicVerificationKeySchema,
  toolPassportCredentialSchema,
  toolPassportSchema,
  type ArtifactVersion,
  type AssessmentReport,
  type PublicVerificationKey,
  type ToolPassportCredential,
} from "../domain/contracts";

const credentialLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export type CommunityIssuer = {
  issuerId: string;
  displayName: string;
  keyId: string;
  privateKey: CryptoKey;
  publicKeyJwk: PublicVerificationKey;
};

export type CommunityCredentialVerification = {
  integrityValid: boolean;
  current: boolean;
  flintVerified: false;
  assuranceLevel: "community-self-attested";
  reasonCodes: string[];
};

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

function signingPayload(
  passport: ToolPassportCredential["passport"],
  proof: Omit<ToolPassportCredential["proof"], "proofValue">,
) {
  return {
    contractVersion,
    credentialType: "ToolPassportCredential" as const,
    passport,
    proof,
  };
}

export async function createCommunityIssuer(
  issuerId = "community:local",
  displayName = "Local AgentGate Community issuer",
): Promise<CommunityIssuer> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicKeyJwk = publicVerificationKeySchema.parse(await crypto.subtle.exportKey("jwk", keyPair.publicKey));
  const keyDigest = await sha256(publicKeyJwk);

  return {
    issuerId,
    displayName,
    keyId: `${issuerId}#key-${keyDigest.slice(7, 19)}`,
    privateKey: keyPair.privateKey,
    publicKeyJwk,
  };
}

export async function issueCommunityToolPassport(input: {
  issuer: CommunityIssuer;
  artifactVersion: ArtifactVersion;
  assessment: AssessmentReport;
  toolName: string;
  now?: string;
}): Promise<ToolPassportCredential> {
  const assessment = assessmentReportSchema.parse(input.assessment);
  const { artifactVersion, issuer } = input;
  const issuedAt = input.now ?? new Date().toISOString();

  if (assessment.verdict !== "PASS" || assessment.coverage.status !== "complete") {
    throw new Error("Community Tool Passport issuance requires a complete PASS assessment.");
  }
  if (
    assessment.artifactId !== artifactVersion.artifactId
    || assessment.artifactVersion !== artifactVersion.version
    || assessment.artifactDigest !== artifactVersion.digest
  ) {
    throw new Error("Assessment does not match the immutable artifact version.");
  }

  const tool = artifactVersion.manifest.tools.find((candidate) => candidate.name === input.toolName);
  if (!tool) throw new Error("Requested tool is not declared by the assessed artifact version.");

  const passportDigest = await sha256({
    artifactDigest: artifactVersion.digest,
    toolName: tool.name,
    issuerId: issuer.issuerId,
    issuedAt,
  });
  const passport = toolPassportSchema.parse({
    contractVersion,
    id: `tool-passport:community:${passportDigest.slice(7, 23)}`,
    assuranceLevel: "community-self-attested",
    issuerId: issuer.issuerId,
    toolName: tool.name,
    artifactId: artifactVersion.artifactId,
    artifactVersion: artifactVersion.version,
    artifactDigest: artifactVersion.digest,
    assessmentId: assessment.id,
    capabilities: tool.capabilities,
    dataClasses: tool.dataClasses,
    destinations: tool.destinations,
    issuedAt,
    expiresAt: addMilliseconds(issuedAt, credentialLifetimeMs),
    status: "active",
  });
  const proof = {
    type: "DataIntegrityProof" as const,
    cryptosuite: "ecdsa-p256-sha256" as const,
    createdAt: issuedAt,
    verificationMethod: issuer.keyId,
    publicKeyJwk: issuer.publicKeyJwk,
  };
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    issuer.privateKey,
    new TextEncoder().encode(canonicalJson(signingPayload(passport, proof))),
  );

  return toolPassportCredentialSchema.parse({
    contractVersion,
    credentialType: "ToolPassportCredential",
    passport,
    proof: {
      ...proof,
      proofValue: encodeBase64Url(new Uint8Array(signature)),
    },
  });
}

export async function verifyCommunityToolPassport(
  input: unknown,
  options: { now?: string } = {},
): Promise<CommunityCredentialVerification> {
  const parsed = toolPassportCredentialSchema.safeParse(input);
  if (!parsed.success || parsed.data.passport.assuranceLevel !== "community-self-attested") {
    return {
      integrityValid: false,
      current: false,
      flintVerified: false,
      assuranceLevel: "community-self-attested",
      reasonCodes: ["COMMUNITY_CREDENTIAL_INVALID"],
    };
  }

  const credential = parsed.data;
  const reasons: string[] = [];
  let signatureValid = false;
  try {
    const { proofValue, ...proof } = credential.proof;
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      credential.proof.publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    signatureValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      decodeBase64Url(proofValue),
      new TextEncoder().encode(canonicalJson(signingPayload(credential.passport, proof))),
    );
  } catch {
    reasons.push("COMMUNITY_SIGNATURE_INVALID");
  }

  if (!signatureValid && !reasons.includes("COMMUNITY_SIGNATURE_INVALID")) {
    reasons.push("COMMUNITY_SIGNATURE_INVALID");
  }
  if (credential.passport.status !== "active") reasons.push("TOOL_PASSPORT_NOT_ACTIVE");

  const now = new Date(options.now ?? new Date().toISOString());
  const current = new Date(credential.passport.issuedAt) <= now && new Date(credential.passport.expiresAt) > now;
  if (!current) reasons.push("TOOL_PASSPORT_NOT_CURRENT");

  return {
    integrityValid: signatureValid,
    current,
    flintVerified: false,
    assuranceLevel: "community-self-attested",
    reasonCodes: reasons.length === 0 ? ["COMMUNITY_CREDENTIAL_INTEGRITY_VERIFIED"] : reasons,
  };
}
