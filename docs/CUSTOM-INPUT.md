# Custom input and troubleshooting

Start from **Safe example** in **Tool assessments**, then edit only the fields you need. Any edit marks the intake as custom and clears stale assessment, credential, registry, assignment, gateway, and evidence state.

## Assessment input

| Field | Accepted input | Important behavior |
| --- | --- | --- |
| Publisher name | Non-empty display text | Names the session-local Publisher Passport. Community does not verify the publisher independently. |
| Source URL | A complete URL such as `https://example.com/tool` | Stored as provenance only. Community does not fetch, clone, install, or execute it. |
| Artifact name | Non-empty display text | Names the submitted artifact. The exact version and digest provide the immutable binding. |
| Exact version | Non-empty text, up to 80 characters | The assessment and Tool Passport bind to this version and the canonical manifest digest. |
| Tool name | 3–160 letters, numbers, `_`, `.`, `:`, or `-` | Becomes the bound action used by the Registry and Gateway. |
| Display title | Non-empty text | Supplies the human-readable tool label. It does not replace the bound Tool name. |
| Description | Non-empty text, up to 1,000 characters | Describes the declared tool and is inspected by the Community Scanner. |
| Capabilities | One or more comma-separated declarations | Empty capability input fails manifest validation. |
| Destinations | Comma-separated host or service declarations | An empty list is unconstrained in Community. An open-world tool with no destination allowlist receives a finding. |
| Data classes | `public`, `internal`, `confidential`, `restricted`, `payment`, or `personal` | These declarations must remain inside every Registry scope used later. |
| Behavior annotations | Checkboxes for `readOnly`, `destructive`, `idempotent`, and `openWorld` | Declare whether the tool only reads, may cause destructive changes, can repeat safely, or can reach beyond fixed destinations. The scanner checks these declarations with the rest of the manifest. |
| Input schema | Valid JSON with `type: "object"`; optional `properties`, `required`, and `additionalProperties` fields must have the expected object, string-array, and boolean shapes | Invalid JSON or a different schema shape fails before assessment. |
| Instructions | Text up to 100,000 characters | Inspected as data by the bounded scanner; never executed. |

A complete PASS is required to issue a Community Tool Passport. PASS means only that this exact manifest satisfied the recorded Community checks; it is not a FLINT Stamp or a vulnerability-free guarantee.

## Registry input

The Registry keeps four scopes separate: agent capability (**CAN**), principal authority (**MAY**), exact-version tool contract (**TOOL**), and the requested assignment (**MAY NOW**). Use comma- or newline-separated values. A trailing `*` is a directional prefix wildcard, so `catalog://approved/*` contains `catalog://approved/item-1` but not `catalog://other/item-1`.

| Registry fields | What to enter |
| --- | --- |
| Organization and principal | Name the organization that owns the policy boundary and the person, organization, or system authorizing the agent. Their IDs are stable local record identifiers. |
| Agent identity | Enter a display name, a stable Agent Passport ID, and the declared SHA-256 fingerprint for this agent build. Community records this binding but does not independently verify it. |
| Observation and coverage | Use Observed Agent ID for the provisional record, confidence for the connected-surface attribution estimate, Evidence sources for the signals seen, Instrumented surfaces for where those signals were collected, and Known blind spots for places the demo cannot observe. |
| CAN, MAY, TOOL, and MAY NOW scope | Keep resource patterns, destinations, side effects, and data classes aligned. MAY NOW must be a subset of the agent capability, principal authority, and exact-version tool contract. |
| Principal authority details | Purpose and mandate states why the action is allowed. Permitted roots bound resources, Denied actions name prohibited actions, Conditions record review terms, and Transaction ceiling sets an optional USD limit when a request includes `transactionUsd`. |

Every requested assignment action, resource, destination, data class, and side effect must fit inside CAN, MAY, and TOOL. Keep matching explicit values in all four columns when first testing custom input.

For resources, destinations, data classes, and side effects, an empty list means unconstrained rather than deny-all. Use explicit values when you intend to restrict a scope.

- IDs accept 3–160 letters, numbers, `_`, `.`, `:`, or `-`.
- The agent fingerprint must be `sha256:` followed by 64 lowercase hexadecimal characters.
- Observation confidence must be between 0 and 100, and evidence sources and instrumented surfaces cannot be empty.
- Authority conditions are recorded in the Semantic Authority Grant and its policy digest, but AgentGate Community does not interpret them during invocation. They are not an enforcement substitute.
- A transaction ceiling is checked only when a gateway request supplies `transactionUsd`. The built-in browser demo request does not supply it.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Manifest validation fails | Use a complete source URL, a valid tool name, at least one capability, and the required JSON Schema shape above. The first error identifies the failing path. |
| Assessment is CONDITIONAL or FAIL | Review the finding ledger. Destructive behavior, risky instructions, open-world access without destinations, or an open input schema can prevent PASS. |
| Community Tool Passport is unavailable | Only a complete PASS for the current immutable artifact version is eligible. The Risky example is intentionally ineligible. |
| Identity registration fails closed | Make MAY NOW a subset of CAN, MAY, and TOOL. Check resources, destinations, data classes, and side effects for one mismatched or broader value. |
| Gateway shows Browser demo | Native `document.modelContext.registerTool` is unavailable. The browser demo is expected and uses the same authorization path. |
| Invocation returns REVIEW | The semantic provider could not establish alignment or returned an error. REVIEW never becomes ALLOW automatically. |
| You changed an earlier field and later records disappeared | This is intentional stale-state protection. Reassess and repeat the trust loop for the new manifest digest. |

Use **Reset demo** for a clean session. Do not enter production credentials, private customer data, or production signing material; see [SECURITY.md](../SECURITY.md).
