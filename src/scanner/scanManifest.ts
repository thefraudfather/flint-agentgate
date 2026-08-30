import {
  artifactManifestSchema,
  assessmentReportSchema,
  contractVersion,
  type ArtifactManifest,
  type AssessmentReport,
  type Finding,
} from "../domain/contracts";
import { sha256 } from "../domain/canonicalize";
import { riskCatalog, severityWeight } from "./riskCatalog";

export const scannerId = "flint.agentgate.static";
export const scannerVersion = "0.1.0";
const maxManifestBytes = 256_000;

type ScanOptions = {
  now?: string;
};

type TextSurface = {
  location: string;
  value: string;
};

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

function verdictFor(findings: Finding[]): AssessmentReport["verdict"] {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) return "FAIL";
  if (findings.some((finding) => finding.severity === "medium" || finding.severity === "low")) return "CONDITIONAL";
  return "PASS";
}

export async function scanManifest(input: unknown, options: ScanOptions = {}): Promise<AssessmentReport> {
  const serialized = JSON.stringify(input);
  if (new TextEncoder().encode(serialized).byteLength > maxManifestBytes) {
    throw new Error(`Manifest exceeds the ${maxManifestBytes}-byte assessment limit.`);
  }

  const manifest = artifactManifestSchema.parse(input);
  const startedAt = options.now ?? new Date().toISOString();
  const digest = await sha256(manifest);
  const findings = deduplicate([
    ...patternFindings(manifest),
    ...annotationFindings(manifest),
  ]);
  findings.push(...toxicCombinationFindings(findings));
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + severityWeight[finding.severity], 0));
  const assessmentId = `assessment:${digest.slice(7, 23)}`;

  return assessmentReportSchema.parse({
    contractVersion,
    id: assessmentId,
    artifactId: manifest.artifact.id,
    artifactVersion: manifest.artifact.version,
    artifactDigest: digest,
    scanner: {
      id: scannerId,
      version: scannerVersion,
      mode: "deterministic-static",
    },
    environment: manifest.environment,
    startedAt,
    completedAt: startedAt,
    verdict: verdictFor(findings),
    score,
    findings,
    limitations: [
      "Static manifest and instruction analysis only; no tool process is executed.",
      "A passing result is not proof that an artifact is vulnerability-free.",
      "The FLINT Stamp is not issued by this scanner stage.",
    ],
  });
}
