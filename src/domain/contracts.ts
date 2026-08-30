import { z } from "zod";

export const contractVersion = "agentgate.v0" as const;

export const environmentSchema = z.enum(["demo", "test", "production"]);
export const statusSchema = z.enum(["active", "frozen", "revoked"]);
export const dataClassSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
  "payment",
  "personal",
]);

const idSchema = z.string().min(3).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
const nonEmptySchema = z.string().trim().min(1).max(1000);
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

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
  maxTransactionUsd: z.number().nonnegative().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const principalIdentitySchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  organizationId: idSchema,
  displayName: nonEmptySchema,
  status: statusSchema,
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
    sourceUri: z.string().url(),
  }),
  tools: z.array(toolDefinitionSchema).min(1).max(128),
  instructions: z.string().max(100_000).default(""),
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
  toolName: idSchema,
  artifactId: idSchema,
  artifactVersion: z.string().min(1).max(80),
  artifactDigest: digestSchema,
  assessmentId: idSchema,
  stampId: idSchema,
  capabilities: z.array(nonEmptySchema).min(1).max(32),
  dataClasses: z.array(dataClassSchema).max(16),
  destinations: z.array(nonEmptySchema).max(32),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: statusSchema,
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
});

export const invocationEvidenceSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: idSchema,
  requestId: idSchema,
  decisionId: idSchema,
  organizationId: idSchema,
  agentId: idSchema,
  toolPassportId: idSchema,
  action: nonEmptySchema,
  resource: z.string().max(1000),
  destination: z.string().max(1000),
  inputDigest: digestSchema,
  outcome: z.enum(["allowed", "blocked", "failed", "completed"]),
  occurredAt: z.string().datetime(),
  signature: z.string().min(16),
});

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
export type AssessmentReport = z.infer<typeof assessmentReportSchema>;
export type AssessmentCheck = z.infer<typeof assessmentCheckSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export type ToolPassport = z.infer<typeof toolPassportSchema>;
export type ToolAssignment = z.infer<typeof toolAssignmentSchema>;
export type GatewayDecision = z.infer<typeof gatewayDecisionSchema>;
export type InvocationEvidence = z.infer<typeof invocationEvidenceSchema>;
export type StampIssuanceDecision = z.infer<typeof stampIssuanceDecisionSchema>;
