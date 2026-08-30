import type { Finding } from "../domain/contracts";

export type RiskRule = {
  id: string;
  severity: Finding["severity"];
  title: string;
  patterns: RegExp[];
  remediation: string;
};

export const riskCatalog: RiskRule[] = [
  {
    id: "AGT-R001_PROMPT_INJECTION",
    severity: "critical",
    title: "Prompt injection instruction",
    patterns: [
      /ignore (all|any|the|your) (previous|prior|system) (instructions?|prompts?)/i,
      /reveal (the )?(system prompt|hidden instructions?)/i,
      /override (the )?(policy|guardrails?|authorization)/i,
    ],
    remediation: "Remove instructions that attempt to override the principal, runtime policy, or system prompt.",
  },
  {
    id: "AGT-R002_SECRET_EXPOSURE",
    severity: "critical",
    title: "Potential embedded secret",
    patterns: [
      /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
      /(?:api[_-]?key|secret|token|password)\s*[:=]\s*[\"'][^\"']{12,}[\"']/i,
    ],
    remediation: "Remove credentials from the artifact and rotate any value that may have been exposed.",
  },
  {
    id: "AGT-R003_PRIVATE_DATA",
    severity: "high",
    title: "Broad private-data access",
    patterns: [
      /read (all|any) (customer|employee|patient|user) (records?|data|files?)/i,
      /export (all|the entire) (database|customer list|address book)/i,
    ],
    remediation: "Constrain data access by purpose, class, resource, tenant, and minimum required fields.",
  },
  {
    id: "AGT-R004_DESTRUCTIVE_CAPABILITY",
    severity: "high",
    title: "Destructive capability",
    patterns: [
      /delete (all|any|the) (files?|records?|accounts?|database)/i,
      /(?:rm\s+-rf|drop\s+table|format\s+(?:disk|drive))/i,
    ],
    remediation: "Require explicit destructive annotations, step-up approval, and a narrowly scoped resource boundary.",
  },
  {
    id: "AGT-R005_FINANCIAL_AUTHORITY",
    severity: "high",
    title: "Unbounded financial authority",
    patterns: [
      /(?:send|transfer|pay|withdraw) (?:any|all|unlimited|arbitrary) (?:amount|funds?|money|crypto)/i,
      /execute (?:any|unlimited) (?:trade|payment|transaction)/i,
    ],
    remediation: "Declare transaction limits, approved destinations, currency, time window, and step-up requirements.",
  },
  {
    id: "AGT-R006_UNTRUSTED_CONTENT",
    severity: "medium",
    title: "Untrusted external content",
    patterns: [
      /follow instructions? (?:from|in) (?:any\s+)?(?:external|remote) (?:webpage|website|document|content)/i,
      /execute (?:commands?|code) (?:from|returned by) (?:the )?(?:web|internet|response)/i,
    ],
    remediation: "Treat retrieved content as data, isolate it from instructions, and enforce an outbound destination allowlist.",
  },
  {
    id: "AGT-R007_UNVERIFIABLE_DEPENDENCY",
    severity: "medium",
    title: "Unverifiable dependency execution",
    patterns: [
      /(?:curl|wget)\s+[^\n|;]+\s*\|\s*(?:sh|bash)/i,
      /npx\s+(?:-y\s+)?[^@\s]+(?:\s|$)/i,
      /uvx\s+[^=\s]+(?:\s|$)/i,
    ],
    remediation: "Pin dependencies by exact version and digest, then verify provenance before execution.",
  },
  {
    id: "AGT-R008_OUTBOUND_NETWORK",
    severity: "medium",
    title: "Unrestricted outbound network access",
    patterns: [
      /(?:send|post|upload|exfiltrate) (?:data|files?|results?) to (?:any|arbitrary|external) (?:url|server|endpoint)/i,
      /connect to any (?:host|domain|server|endpoint)/i,
    ],
    remediation: "Declare and enforce an exact outbound destination allowlist.",
  },
  {
    id: "AGT-R010_SCHEMA_AMBIGUITY",
    severity: "low",
    title: "Ambiguous input contract",
    patterns: [
      /accepts? (?:any|arbitrary) (?:input|parameters?|json|object)/i,
      /additional properties (?:are )?allowed/i,
    ],
    remediation: "Use a closed input schema with explicit types, required fields, limits, and formats.",
  },
];

export const severityWeight: Record<Finding["severity"], number> = {
  critical: 50,
  high: 25,
  medium: 10,
  low: 3,
  info: 0,
};
