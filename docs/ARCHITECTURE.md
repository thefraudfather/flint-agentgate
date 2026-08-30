# AgentGate architecture

## Product boundary

AgentGate is a policy enforcement and evidence plane. It does not claim to discover 100 percent of agents, prove that a tool has no vulnerabilities, or make model-written rules enforceable by themselves.

The architecture has five parts:

1. Identity Registry: principals, organizations, agents, fingerprints, lifecycle state, and semantic authority.
2. Assessment Plane: artifact intake, exact-version digest, staged scanner adapters, evidence, verdict, and stamp review.
3. Tool Registry: FLINT Stamp, Tool Passport, capabilities, data classes, destinations, pricing terms, and assignments.
4. Gateway: conditional tool exposure plus runtime authorization before invocation.
5. Command: observed inventory, posture, decisions, invocation evidence, freeze, and revocation.

The Community build adds two replaceable boundaries:

- `ScannerAdapter`: normalizes any scanner into the stable FLINT Assessment Contract. The bundled Community Scanner is credential-free, read-only, and never executes submitted code.
- `TrustProvider`: owns submission, assessment, issuance, and verification. The bundled Local Trust Provider is fully usable offline after installation. A future FLINT Command provider can implement the same public interface using managed services.

```text
Community UI
  -> TrustProvider
      -> Publisher intake and immutable artifact version
      -> ScannerAdapter
      -> Assessment Contract
      -> Tool Passport issuer and verifier
      -> Runtime decision and signed invocation evidence
  -> Conditional WebMCP Gateway or truthful visible fallback
```

## Stable objects

All durable objects declare `contractVersion: agentgate.v0` and are validated at runtime.

- `PrincipalIdentity`
- `ObservedAgent` with an explicit observed, correlated, verified, or governed state
- `AgentPassport` containing identity but no mutable authority
- `AgentCapabilityClaim` describing what the agent can technically do
- `SemanticAuthorityGrant` describing what the bound principal allows
- `ArtifactManifest`
- `PublisherPassport`
- `ArtifactVersion`
- `AssessmentReport`
- `Stamp`
- `ToolPassport`
- `ToolPassportCredential`
- `ToolSemanticContract` describing the exact assessed tool version
- `AssignmentGrant` containing only the permitted intersection
- `ToolAssignment`
- `GatewayDecision`
- `InvocationEvidence`
- `InvocationEvidenceCredential`

An assessment and Tool Passport bind to the canonical SHA-256 digest of one artifact version. Any code or manifest change requires a new assessment.

## Identity and assignment registry

The Registry preserves the distinction between capability and authority:

```text
Effective capability
  = Agent Capability Claim
  ∩ Principal Semantic Authority Grant
  ∩ exact-version Tool Semantic Contract
  ∩ organization and lifecycle state
  ∩ Assignment Grant
```

The assignment policy accepts only requested subsets. Prefix-wildcard resources and destinations are compared directionally so a narrow request can fit inside a broader grant, but a broader requested wildcard cannot fit inside a narrow grant. Denied actions are evaluated before issuance.

Agent observations advance one evidence-backed state at a time: Observed → Correlated → Verified → Governed. Verified requires a linked Agent Passport. Governed requires an active, currently resolvable assignment. Freeze, revocation, expiry, missing dependencies, inactive principals or organizations, and artifact-version mismatch fail closed.

## Assessment pipeline

The hackathon scanner starts with a bounded, read-only deterministic stage:

1. Validate the submitted manifest and hard size limits.
2. Canonicalize the artifact and compute its digest.
3. Inspect instructions, tool descriptions, schema openness, annotations, capabilities, data classes, and destinations.
4. Apply stable risk IDs and toxic-combination logic.
5. Record every required check with its version, status, and finding count.
6. Emit the FLINT Assessment Contract with policy digest, coverage, limitations, and bounded failure state.

Complete coverage with no findings can produce PASS. Missing checks produce degraded coverage and no better than CONDITIONAL. Validation or scanner failure produces ERROR and no artifact digest claim. Neither state can pass the Stamp gate.

Later adapters can add source inventory, call graphs, threat modeling, Snyk analysis, sandboxed behavioral analysis, adversarial verification, and SARIF. Adapter output must map into FLINT risk IDs and evidence fields.

## Stamp issuance gate

The scanner does not issue a Stamp. The issuance boundary recomputes eligibility from the validated assessment and review inputs. It requires:

- PASS with complete coverage and every required check passed
- exact artifact ID, version, and digest
- an allowed scanner and assessment-policy version
- a fresh assessment in an allowed environment
- an approved review that postdates the assessment and carries evidence references

Demo assessments are denied by the default production issuance policy. The current prototype stops at an eligibility decision and does not claim to create a production cryptographic signature.

The Local Trust Provider may issue a separate community Tool Passport after a complete demo PASS. It generates an ephemeral ECDSA P-256 key, signs the Tool Passport payload, and embeds the public JWK for local integrity verification. The credential is always marked `community-self-attested`, has no `stampId`, and verifies as `flintVerified: false`.

Signature validity proves only that the payload was not changed after issuance by that local key. It does not establish that FLINT reviewed the artifact, controls the issuer, or endorses the credential. FLINT-verified credentials require a FLINT trust anchor and Stamp issued by Command.

## Runtime authorization

An invocation is allowed only when all four inputs intersect:

```text
active agent identity
AND semantic authority
AND active exact-version Tool Passport
AND active tool assignment
AND current request context
```

Deny rules are evaluated before allow rules. Status, expiry, action, resource, data class, destination, side effect, and transaction limits remain outside the model and are enforced by code.

The Registry resolves every dependency at invocation time. Deterministic checks run before the `SemanticIntegrityProvider`; if any deterministic condition fails, the semantic provider is not called. Semantic evaluation can escalate an otherwise valid request to REVIEW or BLOCK, but it cannot turn a deterministic denial into ALLOW. Provider failure produces REVIEW, never ALLOW.

Every successfully resolved invocation emits a locally signed `InvocationEvidenceCredential`. Its payload binds the request and decision to the exact Agent Capability Claim version, Semantic Authority Grant version, Tool Semantic Contract version, Assignment Grant, Tool Passport artifact digest, input digest, and policy digest. The record contains digests and reason codes rather than raw prompts, credentials, or tool output.

## Conditional WebMCP exposure

The browser adapter feature-detects `document.modelContext.registerTool`. If present, it registers only a currently resolvable assignment. If absent, the interface says that WebMCP is unavailable and exposes a visible fallback that calls the same provider and policy path; it never claims a native browser registration occurred.

Eligibility is checked when the surface is synchronized and again inside the registered handler. Freeze, revocation, expiry, or dependency failure removes the registration when an unregister mechanism exists. A stale browser handler still fails closed because invocation re-resolves the assignment before evaluation.

## Initial deployment boundary

The current build is browser-only and uses explicit demo fixtures. It issues ephemeral self-attested community credentials, not FLINT cryptographic Stamps. It does not accept uploaded repositories, execute MCP servers, store production records, or change FLINT production infrastructure. A deployment configuration supplies a strict CSP and baseline browser security headers if this repository is later connected to Vercel.
