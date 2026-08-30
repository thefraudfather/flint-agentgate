import {
  artifactManifestSchema,
  assessmentReportSchema,
  contractVersion,
  type ArtifactManifest,
  type AssessmentCheck,
  type AssessmentReport,
  type Finding,
} from "../domain/contracts";
import { sha256 } from "../domain/canonicalize";
import {
  assessmentChecks,
  assessmentPolicyRecord,
  maxManifestBytes,
  type AssessmentCheckId,
} from "./assessmentPolicy";
import { riskCatalog, severityWeight } from "./riskCatalog";

export const scannerId = "flint.agentgate.static";
export const scannerVersion = "0.2.0";

type ScanOptions = {
  now?: string;
  disabledChecks?: AssessmentCheckId[];
};

type TextSurface = {
  location: string;
  value: string;
};

type FailureCode = "MANIFEST_NOT_SERIALIZABLE" | "MANIFEST_TOO_LARGE" | "MANIFEST_INVALID" | "SCANNER_INTERNAL_ERROR";

function redactEvidence(value: string): string {
  return value
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']+["']/gi, "$1='[REDACTED]'")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function collectText(manifest: ArtifactManifest): TextSurface[] {
  const surfaces: TextSurface[] = [
    { location: "instructions", value: manifest.instructions },
  ];

  manifest.tools.forEach((tool, index) => {
    surfaces.push({ location: `tools[${index}].description`, value: tool.description });
    surfaces.push({ location: `tools[${index}].capabilities`, value: tool.capabilities.join("\n") });
    surfaces.push({ location: `tools[${index}].destinations`, value: tool.destinations.join("\n") });
  });

  return surfaces;
}

function patternFindings(manifest: ArtifactManifest): Finding[] {
  const findings: Finding[] = [];

  for (const surface of collectText(manifest)) {
    for (const risk of riskCatalog) {
      const match = risk.patterns.map((pattern) => surface.value.match(pattern)).find(Boolean);
      if (!match) continue;

      findings.push({
        id: `finding:${risk.id.toLowerCase()}:${findings.length + 1}`,
        riskId: risk.id,
        severity: risk.severity,
        title: risk.title,
        evidence: redactEvidence(match[0]),
        location: surface.location,
        remediation: risk.remediation,
      });
    }
  }

  return findings;
}

function annotationFindings(manifest: ArtifactManifest): Finding[] {
  const findings: Finding[] = [];

  manifest.tools.forEach((tool, index) => {
    if (tool.annotations.destructive) {
      findings.push({
        id: `finding:agt-r004:${index + 1}`,
        riskId: "AGT-R004_DESTRUCTIVE_CAPABILITY",
        severity: "high",
        title: "Declared destructive capability",
        evidence: `${tool.name} is annotated destructive`,
        location: `tools[${index}].annotations.destructive`,
        remediation: "Require a narrow assignment, step-up approval, and immutable invocation evidence.",
      });
    }

    if (tool.annotations.openWorld && tool.destinations.length === 0) {
      findings.push({
        id: `finding:agt-r008:${index + 1}`,
        riskId: "AGT-R008_OUTBOUND_NETWORK",
        severity: "medium",
        title: "Open-world tool has no destination allowlist",
        evidence: `${tool.name} declares open-world access with no destinations`,
        location: `tools[${index}].destinations`,
        remediation: "Declare exact outbound destinations before the tool can be assigned.",
      });
    }

    if (tool.inputSchema.additionalProperties) {
      findings.push({
        id: `finding:agt-r010:${index + 1}`,
        riskId: "AGT-R010_SCHEMA_AMBIGUITY",
        severity: "low",
        title: "Input schema accepts undeclared properties",
        evidence: `${tool.name} sets additionalProperties to true`,
        location: `tools[${index}].inputSchema.additionalProperties`,
        remediation: "Close the input schema and declare each accepted property.",
      });
    }
  });

  return findings;
}

function toxicCombinationFindings(findings: Finding[]): Finding[] {
  const risks = new Set(findings.map((finding) => finding.riskId));
  const hasUntrustedInput = risks.has("AGT-R006_UNTRUSTED_CONTENT");
  const hasSensitiveSink = [
    "AGT-R003_PRIVATE_DATA",
    "AGT-R004_DESTRUCTIVE_CAPABILITY",
    "AGT-R005_FINANCIAL_AUTHORITY",
    "AGT-R008_OUTBOUND_NETWORK",
  ].some((riskId) => risks.has(riskId));

  if (!hasUntrustedInput || !hasSensitiveSink) return [];

  return [{
    id: "finding:agt-r009:1",
    riskId: "AGT-R009_TOXIC_COMBINATION",
    severity: "critical",
    title: "Untrusted content reaches a sensitive capability",
    evidence: "Artifact combines untrusted instructions with a private, destructive, financial, or outbound capability.",
    location: "artifact",
    remediation: "Separate retrieval from action, remove instruction-following behavior, and require a policy gate between stages.",
  }];
}

function deduplicate(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.riskId}:${finding.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verdictFor(findings: Finding[], coverageStatus: AssessmentReport["coverage"]["status"]): AssessmentReport["verdict"] {
  if (coverageStatus === "failed") return "ERROR";
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) return "FAIL";
  if (coverageStatus === "degraded") return "CONDITIONAL";
  if (findings.some((finding) => finding.severity === "medium" || finding.severity === "low")) return "CONDITIONAL";
  return "PASS";
}

function passedCheck(id: AssessmentCheckId, findingCount: number): AssessmentCheck {
  const definition = assessmentChecks.find((check) => check.id === id)!;
  return { ...definition, status: "passed", findingCount };
}

function skippedCheck(id: AssessmentCheckId): AssessmentCheck {
  const definition = assessmentChecks.find((check) => check.id === id)!;
  return { ...definition, status: "skipped", findingCount: 0, detail: `${definition.detail} Check unavailable for this run.` };
}

async function errorReport(
  code: FailureCode,
  message: string,
  startedAt: string,
  failedCheckId: AssessmentCheckId,
): Promise<AssessmentReport> {
  const policy = await assessmentPolicyRecord();
  const errorDigest = await sha256({ code, startedAt, scannerId, scannerVersion });
  const checks: AssessmentCheck[] = assessmentChecks.map((definition) => (
    definition.id === failedCheckId
      ? { ...definition, status: "failed", findingCount: 0, detail: message }
      : { ...definition, status: "skipped", findingCount: 0, detail: "Not run after the assessment failed closed." }
  ));

  return assessmentReportSchema.parse({
    contractVersion,
    id: `assessment:error:${errorDigest.slice(7, 23)}`,
    artifactId: null,
    artifactVersion: null,
    artifactDigest: null,
    scanner: { id: scannerId, version: scannerVersion, mode: "deterministic-static" },
    policy,
    coverage: { status: "failed", completedChecks: 0, requiredChecks: assessmentChecks.length, checks },
    environment: "test",
    startedAt,
    completedAt: startedAt,
    verdict: "ERROR",
    score: 0,
    findings: [],
    limitations: [
      "The assessment failed closed and cannot support a FLINT Stamp.",
      "No submitted tool process was executed.",
    ],
    failure: { code, message },
  });
}

export async function scanManifest(input: unknown, options: ScanOptions = {}): Promise<AssessmentReport> {
  const startedAt = options.now ?? new Date().toISOString();
  let serialized: string;

  try {
    const candidate = JSON.stringify(input);
    if (candidate === undefined) {
      return errorReport("MANIFEST_NOT_SERIALIZABLE", "Manifest must be a serializable object.", startedAt, "AGT-C001_CONTRACT_VALIDATION");
    }
    serialized = candidate;
  } catch {
    return errorReport("MANIFEST_NOT_SERIALIZABLE", "Manifest must be a serializable object.", startedAt, "AGT-C001_CONTRACT_VALIDATION");
  }

  if (new TextEncoder().encode(serialized).byteLength > maxManifestBytes) {
    return errorReport("MANIFEST_TOO_LARGE", `Manifest exceeds the ${maxManifestBytes}-byte assessment limit.`, startedAt, "AGT-C001_CONTRACT_VALIDATION");
  }

  const parsed = artifactManifestSchema.safeParse(input);
  if (!parsed.success) {
    return errorReport("MANIFEST_INVALID", "Manifest failed the closed FLINT artifact contract.", startedAt, "AGT-C001_CONTRACT_VALIDATION");
  }

  const manifest = parsed.data;

  try {
    const digest = await sha256(manifest);
    const disabledChecks = new Set(options.disabledChecks ?? []);
    const checks: AssessmentCheck[] = [
      passedCheck("AGT-C001_CONTRACT_VALIDATION", 0),
      passedCheck("AGT-C002_CANONICAL_DIGEST", 0),
    ];
    let findings: Finding[] = [];

    if (disabledChecks.has("AGT-C003_TEXT_RISK_RULES")) {
      checks.push(skippedCheck("AGT-C003_TEXT_RISK_RULES"));
    } else {
      const textFindings = patternFindings(manifest);
      findings.push(...textFindings);
      checks.push(passedCheck("AGT-C003_TEXT_RISK_RULES", textFindings.length));
    }

    if (disabledChecks.has("AGT-C004_DECLARATION_CONTROLS")) {
      checks.push(skippedCheck("AGT-C004_DECLARATION_CONTROLS"));
    } else {
      const declarationFindings = annotationFindings(manifest);
      findings.push(...declarationFindings);
      checks.push(passedCheck("AGT-C004_DECLARATION_CONTROLS", declarationFindings.length));
    }

    findings = deduplicate(findings);
    if (disabledChecks.has("AGT-C005_TOXIC_COMBINATIONS")) {
      checks.push(skippedCheck("AGT-C005_TOXIC_COMBINATIONS"));
    } else {
      const toxicFindings = toxicCombinationFindings(findings);
      findings.push(...toxicFindings);
      checks.push(passedCheck("AGT-C005_TOXIC_COMBINATIONS", toxicFindings.length));
    }

    const coverageStatus = checks.every((check) => check.status === "passed") ? "complete" : "degraded";
    const rawScore = Math.max(0, 100 - findings.reduce((total, finding) => total + severityWeight[finding.severity], 0));
    const score = coverageStatus === "complete" ? rawScore : Math.min(rawScore, 79);
    const policy = await assessmentPolicyRecord();
    const assessmentId = `assessment:${digest.slice(7, 23)}`;

    return assessmentReportSchema.parse({
      contractVersion,
      id: assessmentId,
      artifactId: manifest.artifact.id,
      artifactVersion: manifest.artifact.version,
      artifactDigest: digest,
      scanner: { id: scannerId, version: scannerVersion, mode: "deterministic-static" },
      policy,
      coverage: {
        status: coverageStatus,
        completedChecks: checks.filter((check) => check.status === "passed").length,
        requiredChecks: assessmentChecks.length,
        checks,
      },
      environment: manifest.environment,
      startedAt,
      completedAt: startedAt,
      verdict: verdictFor(findings, coverageStatus),
      score,
      findings,
      limitations: [
        "Static manifest and instruction analysis only; no tool process is executed.",
        "A passing result is not proof that an artifact is vulnerability-free.",
        "The FLINT Stamp is not issued by this scanner stage.",
      ],
    });
  } catch {
    return errorReport("SCANNER_INTERNAL_ERROR", "The scanner could not complete the required assessment stages.", startedAt, "AGT-C002_CANONICAL_DIGEST");
  }
}
