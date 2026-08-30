# AgentGate architecture

## Product boundary

AgentGate is a policy enforcement and evidence plane. It does not claim to discover 100 percent of agents, prove that a tool has no vulnerabilities, or make model-written rules enforceable by themselves.

The architecture has five parts:

1. Identity Registry: principals, organizations, agents, fingerprints, lifecycle state, and semantic authority.
2. Assessment Plane: artifact intake, exact-version digest, staged scanner adapters, evidence, verdict, and stamp review.
3. Tool Registry: FLINT Stamp, Tool Passport, capabilities, data classes, destinations, pricing terms, and assignments.
4. Gateway: conditional tool exposure plus runtime authorization before invocation.
5. Command: observed inventory, posture, decisions, invocation evidence, freeze, and revocation.

## Stable objects

All durable objects declare `contractVersion: agentgate.v0` and are validated at runtime.

- `PrincipalIdentity`
- `AgentIdentity` with `SemanticAuthority`
- `ArtifactManifest`
- `AssessmentReport`
- `Stamp`
- `ToolPassport`
- `ToolAssignment`
- `GatewayDecision`
- `InvocationEvidence`

An assessment and Tool Passport bind to the canonical SHA-256 digest of one artifact version. Any code or manifest change requires a new assessment.

## Assessment pipeline

The hackathon scanner starts with a bounded, read-only deterministic stage:

1. Validate the submitted manifest and hard size limits.
2. Canonicalize the artifact and compute its digest.
3. Inspect instructions, tool descriptions, schema openness, annotations, capabilities, data classes, and destinations.
4. Apply stable risk IDs and toxic-combination logic.
5. Emit the FLINT Assessment Contract with limitations.

Later adapters can add source inventory, call graphs, threat modeling, Snyk analysis, sandboxed behavioral analysis, adversarial verification, and SARIF. Adapter output must map into FLINT risk IDs and evidence fields.

## Runtime authorization

An invocation is allowed only when all four inputs intersect:

```text
active agent identity
AND semantic authority
AND active exact-version Tool Passport
AND active tool assignment
AND current request context
```

Deny rules are evaluated before allow rules. Status, expiry, action, resource, data class, destination, and transaction limits remain outside the model and are enforced by code.

## Initial deployment boundary

The current build is browser-only and uses explicit demo fixtures. It does not issue cryptographic stamps, accept uploaded repositories, execute MCP servers, store production records, or change FLINT production infrastructure.
