# FLINT Assessment Contract v0

The Assessment Contract is the stable boundary between scanner adapters, the AgentGate registry, Command, and the FLINT Stamp process. Adapter-specific output must be normalized into this contract before it can affect authorization.

## Verdicts

| Verdict | Meaning | Stamp path |
| --- | --- | --- |
| PASS | Complete required coverage and no blocking finding | Eligible for review only |
| CONDITIONAL | Lower-severity finding or degraded coverage | Blocked pending controls and reassessment |
| FAIL | Critical or high-severity risk | Blocked |
| ERROR | Validation or required scanner stage failed | Failed closed |

## Required checks

| Check | Purpose |
| --- | --- |
| `AGT-C001_CONTRACT_VALIDATION` | Validate the closed artifact manifest contract |
| `AGT-C002_CANONICAL_DIGEST` | Bind the report to the exact artifact version and SHA-256 digest |
| `AGT-C003_TEXT_RISK_RULES` | Inspect declared instruction and description surfaces |
| `AGT-C004_DECLARATION_CONTROLS` | Inspect schemas, annotations, capabilities, data classes, and destinations |
| `AGT-C005_TOXIC_COMBINATIONS` | Correlate untrusted inputs with sensitive capabilities |

`coverage.status` is derived from the check ledger. It cannot be declared independently:

- `complete`: every required check passed
- `degraded`: at least one required check was skipped and none failed
- `failed`: at least one required check failed

The schema rejects PASS when coverage is not complete, a check did not pass, the artifact identity is incomplete, or a failure record exists.

## Evidence handling

- Evidence snippets are whitespace-normalized, bounded to 240 characters, and potential credentials are redacted.
- Invalid input returns a generic bounded failure message rather than raw parser or stack details.
- An ERROR report makes no artifact digest claim.
- The report always declares static-analysis blind spots and that no submitted tool process was executed.

## Stamp eligibility

PASS is necessary but insufficient. The independent issuance policy also checks environment, report age, scanner version, assessment-policy version, exact artifact identity, review status, review ordering, reviewer identity, and evidence references.

The current prototype emits an eligibility decision only. A future server-side issuer must sign the resulting Stamp with FLINT-managed asymmetric keys after this gate succeeds.
