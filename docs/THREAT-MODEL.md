# AgentGate threat model

## Assets

- Principal and agent identities
- Semantic authority and assignment policies
- Artifact source, manifests, and assessment evidence
- FLINT Stamps and Tool Passports
- Invocation requests, decisions, and signed evidence
- Publisher and enterprise credentials

## Trust boundaries

| Boundary | Untrusted input | Required control |
| --- | --- | --- |
| Publisher to assessment plane | Manifest, source, instructions, dependencies | Size limits, schema validation, canonical digest, read-only intake, sandbox for any future execution |
| Scanner adapter to assessment contract | Findings and model output | Stable risk mapping, evidence requirement, deterministic validation, adapter versioning |
| Agent to gateway | Identity, action, resource, input, destination | Authenticated identity, nonce and replay controls, policy intersection, default deny |
| Gateway to tool | Approved invocation | Exact-version passport, outbound allowlist, minimal credentials, timeout and quota |
| Command operator to control plane | Freeze, revoke, assign, approve | Strong authentication, role separation, CSRF defense, immutable audit log |

## Primary threats and mitigations

| Threat | Initial mitigation |
| --- | --- |
| Prompt injection in skills or tool descriptions | Deterministic detection, content-as-data boundary, no execution during scan |
| Malicious or compromised dependency | Exact-version and digest requirement, future provenance adapter, sandboxed analysis |
| Toxic combination of untrusted input and sensitive authority | Cross-finding rule and runtime semantic gate |
| Over-broad agent mandate | Structured allow and deny rules for action, resource, data class, destination, limits, and expiry |
| Stamp reuse after artifact change | Stamp and Tool Passport bind to the canonical artifact digest |
| Forged PASS through missing scanner stages | Schema-enforced check ledger; incomplete coverage cannot validate as PASS |
| Caller fabricates an eligible issuance decision | Issuance guard recomputes the decision from the assessment and review inputs |
| Stale or precomputed approval reused | Assessment age limit and review-time ordering enforced by the issuance policy |
| Revoked agent or tool remains callable | Status and expiry checked for every invocation, with default deny |
| Forged community evidence | Ephemeral P-256 signatures detect post-issuance tampering; the embedded key is not a FLINT trust anchor and no production-signature claim is made |
| Community credential presented as FLINT assurance | Separate assurance enum, no community `stampId`, explicit UI labeling, trademark policy, and verification result that keeps integrity separate from FLINT trust |
| Locally embedded verification key mistaken for a trust anchor | Community verifier returns `flintVerified: false`; managed verification must pin FLINT-controlled keys independently |
| Scanner compromise | Scanner is a governed workload identity, read-only by default, with bounded resources and no production secrets |
| False assurance from partial discovery | Coverage shown as observed telemetry, never as complete inventory |

## Explicit non-goals for this slice

- Running arbitrary submitted code
- Autonomous remediation
- Production identity or key management; community keys are ephemeral demo keys
- Public upload endpoints
- A claim of complete agent discovery or complete vulnerability detection
