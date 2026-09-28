import { z } from "zod";

export const contractVersion = "agentgate.v0" as const;
export const transactionUsdSchema = z.number().finite().nonnegative();

export const environmentSchema = z.enum(["demo", "test", "production"]);
export const statusSchema = z.enum(["active", "frozen", "revoked"]);
export const assuranceLevelSchema = z.enum(["community-self-attested", "flint-verified"]);
export const dataClassSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
  "payment",
  "personal",
]);

const idSchema = z.string().min(3).max(160).regex(
  /^[a-zA-Z0-9_.:-]+$/,
  "Use only letters, numbers, periods, underscores, colons, or hyphens.",
);
const nonEmptySchema = z.string().trim().min(1).max(1000);
const digestSchema = z.string().regex(
  /^sha256:[a-f0-9]{64}$/,
  "Use sha256: followed by 64 lowercase hexadecimal characters.",
);

export const semanticRuleSchema = z.object({
  action: nonEmptySchema,
  resources: z.array(nonEmptySchema).max(64).default([]),
  dataClasses: z.array(dataClassSchema).max(16).default([]),
  destinations: z.array(nonEmptySchema).max(32).default([]),
  conditions: z.array(nonEmptySchema).max(32).default([]),
});

export const semanticAuthoritySchema = z.object({
  purpose: nonEmptySchema,
  allow: z.array(semanticRuleSchema).min(1).max(128),
  deny: z.array(semanticRuleSchema).max(128).default([]),
  permittedRoots: z.array(nonEmptySchema).max(32).default([]),
  maxTransactionUsd: transactionUsdSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export const principalIdentitySchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema,
  displayName: nonEmptySchema,
  status: statusSchema,
});

export const organizationIdentitySchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  displayName: nonEmptySchema,
  status: statusSchema,
});

export const observedAgentStateSchema = z.enum(["observed", "correlated", "verified", "governed"]);

export const observedAgentSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema.optional(),
  state: observedAgentStateSchema,
  confidence: z.number().int().min(0).max(100),
  evidenceSources: z.array(nonEmptySchema).min(1).max(64),
  instrumentedSurfaces: z.array(nonEmptySchema).min(1).max(32),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  linkedAgentPassportId: idSchema.optional(),
  blindSpots: z.array(nonEmptySchema).max(32).default([]),
}).superRefine((agent, context) => {
  if (new Date(agent.lastSeenAt) < new Date(agent.firstSeenAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastSeenAt"],
      message: "Last-seen time cannot predate first-seen time.",
    });
  }
  if (["verified", "governed"].includes(agent.state) && !agent.linkedAgentPassportId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["linkedAgentPassportId"],
      message: "Verified and governed observations require a linked Agent Passport.",
    });
  }
});

export const agentPassportSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema,
  principalId: idSchema,
  displayName: nonEmptySchema,
  fingerprint: digestSchema,
  status: statusSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const capabilityDescriptorSchema = z.object({
  action: nonEmptySchema,
  resources: z.array(nonEmptySchema).max(64).default([]),
  dataClasses: z.array(dataClassSchema).max(16).default([]),
  destinations: z.array(nonEmptySchema).max(32).default([]),
  sideEffects: z.array(nonEmptySchema).max(32).default([]),
});

export const agentCapabilityClaimSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  agentPassportId: idSchema,
  version: z.number().int().positive(),
  issuerId: idSchema,
  capabilities: z.array(capabilityDescriptorSchema).min(1).max(128),
  evidenceRefs: z.array(nonEmptySchema).min(1).max(128),
  status: statusSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const semanticAuthorityGrantSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  agentPassportId: idSchema,
  issuerPrincipalId: idSchema,
  version: z.number().int().positive(),
  purpose: nonEmptySchema,
  allow: z.array(semanticRuleSchema).min(1).max(128),
  deny: z.array(semanticRuleSchema).max(128).default([]),
  permittedRoots: z.array(nonEmptySchema).max(64).default([]),
  permittedSideEffects: z.array(nonEmptySchema).max(32).default([]),
  maxTransactionUsd: transactionUsdSchema.optional(),
  status: statusSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const authorityChangeProposalSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  agentPassportId: idSchema,
  previousAuthorityGrantId: idSchema,
  proposedAuthorityGrantId: idSchema,
  classification: z.enum(["narrowing", "expansion", "mixed", "equivalent"]),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedById: idSchema,
  reason: nonEmptySchema,
  requestedAt: z.string().datetime(),
  decidedById: idSchema.optional(),
  decidedAt: z.string().datetime().optional(),
}).superRefine((proposal, context) => {
  const decided = proposal.status !== "pending";
  if (decided !== Boolean(proposal.decidedById && proposal.decidedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Approved and rejected authority changes require a decision actor and time.",
    });
  }
});

export const agentIdentitySchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema,
  principalId: idSchema,
  displayName: nonEmptySchema,
  status: statusSchema,
  fingerprint: digestSchema,
  authority: semanticAuthoritySchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const toolSchemaSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.unknown()).default({}),
  required: z.array(z.string()).default([]),
  additionalProperties: z.boolean().default(false),
}).strict().superRefine((schema, context) => {
  schema.required.forEach((property, index) => {
    if (!Object.hasOwn(schema.properties, property)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["required", index],
        message: `Required property "${property}" is not declared in properties.`,
      });
    }
  });
});

export const toolDefinitionSchema = z.object({
  name: idSchema,
  title: nonEmptySchema,
  description: nonEmptySchema,
  inputSchema: toolSchemaSchema,
  annotations: z.object({
    readOnly: z.boolean(),
    destructive: z.boolean(),
    idempotent: z.boolean(),
    openWorld: z.boolean(),
  }),
  capabilities: z.array(nonEmptySchema).min(1).max(32),
  dataClasses: z.array(dataClassSchema).max(16),
  destinations: z.array(nonEmptySchema).max(32),
});

export const artifactManifestSchema = z.object({
  contractVersion: z.literal(contractVersion),
  environment: environmentSchema,
  publisher: z.object({
    id: idSchema,
    organizationId: idSchema,
    displayName: nonEmptySchema,
  }),
  artifact: z.object({
    id: idSchema,
    name: nonEmptySchema,
    version: z.string().trim().min(1).max(80),
    sourceUri: z.string().url("Enter a complete URL such as https://example.com/tool."),
  }),
  tools: z.array(toolDefinitionSchema).min(1).max(128),
  instructions: z.string().max(100_000).default(""),
});

export const publisherPassportSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  publisherId: idSchema,
  organizationId: idSchema,
  displayName: nonEmptySchema,
  assuranceLevel: z.literal("community-self-attested"),
  issuerId: idSchema,
  status: statusSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const artifactVersionSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  artifactId: idSchema,
  version: z.string().trim().min(1).max(80),
  digest: digestSchema,
  publisherPassportId: idSchema,
  submittedAt: z.string().datetime(),
  manifest: artifactManifestSchema,
});

export const findingSchema = z.object({
  id: idSchema,
  riskId: idSchema,
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  title: nonEmptySchema,
  evidence: z.string().max(500),
  location: z.string().max(300),
  remediation: z.string().max(1000),
});

export const assessmentCheckSchema = z.object({
  id: idSchema,
  version: z.string().min(1).max(80),
  status: z.enum(["passed", "failed", "skipped"]),
  findingCount: z.number().int().nonnegative(),
  detail: z.string().max(500),
});

export const assessmentReportSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  artifactId: idSchema.nullable(),
  artifactVersion: z.string().min(1).max(80).nullable(),
  artifactDigest: digestSchema.nullable(),
  scanner: z.object({
    id: idSchema,
    version: z.string().min(1).max(80),
    mode: z.literal("deterministic-static"),
  }),
  policy: z.object({
    id: idSchema,
    version: z.string().min(1).max(80),
    digest: digestSchema,
  }),
  coverage: z.object({
    status: z.enum(["complete", "degraded", "failed"]),
    completedChecks: z.number().int().nonnegative(),
    requiredChecks: z.number().int().positive(),
    checks: z.array(assessmentCheckSchema).min(1).max(64),
  }),
  environment: environmentSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  verdict: z.enum(["PASS", "CONDITIONAL", "FAIL", "ERROR"]),
  score: z.number().int().min(0).max(100),
  findings: z.array(findingSchema).max(1000),
  limitations: z.array(z.string().max(500)).max(32),
  failure: z.object({
    code: idSchema,
    message: z.string().min(1).max(500),
  }).optional(),
}).superRefine((report, context) => {
  const allChecksPassed = report.coverage.checks.every((check) => check.status === "passed");
  const anyCheckFailed = report.coverage.checks.some((check) => check.status === "failed");
  const passedCheckCount = report.coverage.checks.filter((check) => check.status === "passed").length;

  if (report.coverage.requiredChecks !== report.coverage.checks.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "requiredChecks"],
      message: "Required check count must match the check ledger.",
    });
  }

  if (report.coverage.completedChecks !== passedCheckCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "completedChecks"],
      message: "Completed check count must match passed checks.",
    });
  }

  if (
    (report.coverage.status === "complete" && !allChecksPassed)
    || (report.coverage.status === "degraded" && (allChecksPassed || anyCheckFailed))
    || (report.coverage.status === "failed" && !anyCheckFailed)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverage", "status"],
      message: "Coverage status must match the check ledger.",
    });
  }

  if (new Date(report.completedAt) < new Date(report.startedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAt"],
      message: "Assessment completion cannot predate its start.",
    });
  }

  if (report.verdict === "PASS") {
    if (report.coverage.status !== "complete" || !allChecksPassed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verdict"],
        message: "PASS requires complete coverage and every required check to pass.",
      });
    }
    if (!report.artifactId || !report.artifactVersion || !report.artifactDigest) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifactDigest"],
        message: "PASS requires a complete exact-version artifact identity.",
      });
    }
    if (report.failure) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failure"],
        message: "PASS cannot include a scanner failure.",
      });
    }
  }

  if (report.verdict === "ERROR" && !report.failure) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failure"],
      message: "ERROR requires a bounded failure record.",
    });
  }

  if (report.coverage.status === "failed" && report.verdict !== "ERROR") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["verdict"],
      message: "Failed coverage requires an ERROR verdict.",
    });
  }
});

export const stampSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  assessmentId: idSchema,
  artifactDigest: digestSchema,
  status: z.enum(["valid", "expired", "revoked"]),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  issuer: idSchema,
  signature: z.string().min(16),
});

export const stampIssuanceDecisionSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  assessmentId: idSchema,
  artifactDigest: digestSchema.nullable(),
  eligible: z.boolean(),
  reasonCodes: z.array(idSchema).min(1).max(32),
  evaluatedAt: z.string().datetime(),
  policyDigest: digestSchema,
});

export const toolPassportSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  assuranceLevel: assuranceLevelSchema,
  issuerId: idSchema,
  toolName: idSchema,
  artifactId: idSchema,
  artifactVersion: z.string().min(1).max(80),
  artifactDigest: digestSchema,
  assessmentId: idSchema,
  stampId: idSchema.optional(),
  capabilities: z.array(nonEmptySchema).min(1).max(32),
  dataClasses: z.array(dataClassSchema).max(16),
  destinations: z.array(nonEmptySchema).max(32),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: statusSchema,
}).superRefine((passport, context) => {
  if (passport.assuranceLevel === "community-self-attested" && passport.stampId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stampId"],
      message: "A community Tool Passport cannot claim a FLINT Stamp.",
    });
  }

  if (passport.assuranceLevel === "flint-verified" && !passport.stampId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stampId"],
      message: "A FLINT-verified Tool Passport requires a FLINT Stamp.",
    });
  }
});

export const publicVerificationKeySchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1),
  y: z.string().min(1),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string()).optional(),
});

export const toolPassportCredentialSchema = z.object({
  contractVersion: z.literal(contractVersion),
  credentialType: z.literal("ToolPassportCredential"),
  passport: toolPassportSchema,
  proof: z.object({
    type: z.literal("DataIntegrityProof"),
    cryptosuite: z.literal("ecdsa-p256-sha256"),
    createdAt: z.string().datetime(),
    verificationMethod: z.string().min(5).max(240).regex(/^[a-zA-Z0-9_.:#-]+$/),
    publicKeyJwk: publicVerificationKeySchema,
    proofValue: z.string().regex(/^[A-Za-z0-9_-]+$/).min(16),
  }),
}).superRefine((credential, context) => {
  if (!credential.proof.verificationMethod.startsWith(`${credential.passport.issuerId}#`)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proof", "verificationMethod"],
      message: "Proof verification method must be controlled by the passport issuer.",
    });
  }
  if (credential.proof.createdAt !== credential.passport.issuedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proof", "createdAt"],
      message: "Proof creation time must match Tool Passport issuance time.",
    });
  }
});

export const toolSemanticContractSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  toolPassportId: idSchema,
  artifactDigest: digestSchema,
  version: z.number().int().positive(),
  allowedActions: z.array(nonEmptySchema).min(1).max(64),
  resources: z.array(nonEmptySchema).max(64).default([]),
  dataClasses: z.array(dataClassSchema).max(16).default([]),
  destinations: z.array(nonEmptySchema).max(32).default([]),
  sideEffects: z.array(nonEmptySchema).max(32).default([]),
  status: statusSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const assignmentGrantSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema,
  agentPassportId: idSchema,
  capabilityClaimId: idSchema,
  semanticAuthorityGrantId: idSchema,
  toolPassportId: idSchema,
  toolSemanticContractId: idSchema,
  allowedActions: z.array(nonEmptySchema).min(1).max(64),
  resourcePatterns: z.array(nonEmptySchema).max(64),
  dataClasses: z.array(dataClassSchema).max(16),
  destinations: z.array(nonEmptySchema).max(32),
  sideEffects: z.array(nonEmptySchema).max(32),
  status: statusSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const toolAssignmentSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema,
  agentId: idSchema,
  toolPassportId: idSchema,
  allowedActions: z.array(nonEmptySchema).min(1).max(64),
  resourcePatterns: z.array(nonEmptySchema).max(64),
  dataClasses: z.array(dataClassSchema).max(16),
  destinations: z.array(nonEmptySchema).max(32),
  status: statusSchema,
  expiresAt: z.string().datetime(),
});

export const gatewayDecisionSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  requestId: idSchema,
  agentId: idSchema,
  toolPassportId: idSchema,
  assignmentId: idSchema.optional(),
  verdict: z.enum(["ALLOW", "STEP_UP", "REVIEW", "BLOCK"]),
  reasonCodes: z.array(idSchema).min(1).max(32),
  evaluatedAt: z.string().datetime(),
  policyDigest: digestSchema,
  semanticIntegrity: z.object({
    status: z.enum(["not-evaluated", "aligned", "uncertain", "misaligned", "error"]),
    reasonCodes: z.array(idSchema).min(1).max(16),
  }).optional(),
});

export const invocationEvidenceSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  requestId: idSchema,
  decisionId: idSchema,
  organizationId: idSchema,
  issuerId: idSchema,
  agentId: idSchema,
  toolPassportId: idSchema,
  artifactDigest: digestSchema,
  capabilityClaimId: idSchema,
  capabilityClaimVersion: z.number().int().positive(),
  semanticAuthorityGrantId: idSchema,
  semanticAuthorityGrantVersion: z.number().int().positive(),
  toolSemanticContractId: idSchema,
  toolSemanticContractVersion: z.number().int().positive(),
  assignmentId: idSchema,
  action: nonEmptySchema,
  resource: z.string().max(1000),
  destination: z.string().max(1000),
  inputDigest: digestSchema,
  policyDigest: digestSchema,
  verdict: z.enum(["ALLOW", "STEP_UP", "REVIEW", "BLOCK"]),
  reasonCodes: z.array(idSchema).min(1).max(32),
  outcome: z.enum(["allowed", "blocked", "failed", "completed"]),
  occurredAt: z.string().datetime(),
});

export const invocationEvidenceCredentialSchema = z.object({
  contractVersion: z.literal(contractVersion),
  credentialType: z.literal("InvocationEvidenceCredential"),
  evidence: invocationEvidenceSchema,
  proof: z.object({
    type: z.literal("DataIntegrityProof"),
    cryptosuite: z.literal("ecdsa-p256-sha256"),
    createdAt: z.string().datetime(),
    verificationMethod: z.string().min(5).max(240).regex(/^[a-zA-Z0-9_.:#-]+$/),
    publicKeyJwk: publicVerificationKeySchema,
    proofValue: z.string().regex(/^[A-Za-z0-9_-]+$/).min(16),
  }),
}).superRefine((credential, context) => {
  if (!credential.proof.verificationMethod.startsWith(`${credential.evidence.issuerId}#`)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proof", "verificationMethod"],
      message: "Proof verification method must be controlled by the evidence issuer.",
    });
  }
  if (credential.proof.createdAt !== credential.evidence.occurredAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proof", "createdAt"],
      message: "Proof creation time must match invocation evidence time.",
    });
  }
});

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
export type PublisherPassport = z.infer<typeof publisherPassportSchema>;
export type ArtifactVersion = z.infer<typeof artifactVersionSchema>;
export type OrganizationIdentity = z.infer<typeof organizationIdentitySchema>;
export type ObservedAgent = z.infer<typeof observedAgentSchema>;
export type AgentPassport = z.infer<typeof agentPassportSchema>;
export type AgentCapabilityClaim = z.infer<typeof agentCapabilityClaimSchema>;
export type SemanticAuthorityGrant = z.infer<typeof semanticAuthorityGrantSchema>;
export type AuthorityChangeProposal = z.infer<typeof authorityChangeProposalSchema>;
export type AssessmentReport = z.infer<typeof assessmentReportSchema>;
export type AssessmentCheck = z.infer<typeof assessmentCheckSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type PrincipalIdentity = z.infer<typeof principalIdentitySchema>;
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export type ToolPassport = z.infer<typeof toolPassportSchema>;
export type PublicVerificationKey = z.infer<typeof publicVerificationKeySchema>;
export type ToolPassportCredential = z.infer<typeof toolPassportCredentialSchema>;
export type ToolSemanticContract = z.infer<typeof toolSemanticContractSchema>;
export type AssignmentGrant = z.infer<typeof assignmentGrantSchema>;
export type ToolAssignment = z.infer<typeof toolAssignmentSchema>;
export type GatewayDecision = z.infer<typeof gatewayDecisionSchema>;
export type InvocationEvidence = z.infer<typeof invocationEvidenceSchema>;
export type InvocationEvidenceCredential = z.infer<typeof invocationEvidenceCredentialSchema>;
export type StampIssuanceDecision = z.infer<typeof stampIssuanceDecisionSchema>;
