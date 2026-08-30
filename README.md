# FLINT AgentGate

FLINT AgentGate is an enterprise trust gateway for AI agents and MCP tools. It combines a versioned identity registry, semantic authority, exact-version tool assessments, runtime policy enforcement, and signed evidence.

This repository is an isolated hackathon prototype. It does not modify or deploy the production FLINT MVP.

**[Run the live WebMCP demo](https://flint-agentgate.vercel.app)** · **[Open FLINT Command](https://flint.network/command/app)**

## Community and Command

This repository is the cloneable **AgentGate Community** reference implementation. It works without a FLINT account or third-party scanner credential. Community credentials are locally signed and explicitly marked `community-self-attested`; they are not a FLINT Stamp and do not represent FLINT verification.

**FLINT Command** is the managed assurance layer for FLINT-controlled identity and Stamp issuance, continuous discovery and reassessment, proprietary detection, revocation, monitoring, enterprise controls, and network intelligence. The public provider and scanner interfaces keep the Community integration compatible with those managed services without making them necessary for the local flow.

## What is implemented

- Versioned contracts for principals, agent identities, semantic authority, tool submissions, assessments, FLINT Stamps, Tool Passports, assignments, gateway decisions, and invocation evidence.
- A bounded deterministic scanner for manifest, schema, annotation, instruction, destination, and toxic-combination risks.
- A fail-closed assessment ledger with explicit scanner version, policy version and digest, required-check coverage, bounded errors, and blind spots.
- A hard Stamp issuance gate requiring a fresh complete production PASS and an approved evidence-bearing review.
- A credential-free Community Scanner behind a stable scanner-adapter interface.
- Immutable publisher intake records and exact-version artifact bindings.
- Locally generated P-256 signing keys, signed community Tool Passports, and integrity verification.
- An assurance boundary that prevents community credentials from claiming a FLINT Stamp.
- A Local Trust Provider that can later be replaced by a managed Command provider without changing public contracts.
- Separate, versioned Agent Passport, Capability Claim, Semantic Authority Grant, Tool Semantic Contract, and Assignment Grant records.
- An assignment policy that rejects any requested action, resource, data class, destination, or side effect outside the complete authorization intersection.
- Distinct Observed, Correlated, Verified, and Governed agent states with evidence and blind-spot disclosure.
- A gateway evaluator that requires the intersection of agent authority, active Tool Passport, active assignment, exact tool semantics, and request context.
- A deterministic-first Semantic Integrity boundary that may escalate ALLOW to REVIEW or BLOCK but can never override a deterministic denial.
- Signed P-256 invocation evidence binding the decision to exact capability, authority, contract, assignment, artifact, input, and policy versions.
- Conditional `document.modelContext.registerTool` exposure with a truthful visible fallback when WebMCP is unavailable.
- Invocation-time eligibility re-resolution so freeze, revocation, and expiry remove the tool or deny stale registered handlers.
- A responsive Command-style interface with two clearly labeled demo artifacts.
- Tests for the stable contracts, safe and risky assessments, and semantic authorization boundaries.

The scanner never executes a submitted tool. A PASS is eligibility for additional stamp review, not proof that an artifact is vulnerability-free.

## Run locally

```bash
npm install
npm test
npm run build
npm run dev
```

Before publishing a release candidate, run the complete reproducible gate:

```bash
npm run release:check
```

The local development server binds to `127.0.0.1:4173`.

The default demo flow is:

1. Select the safe or malicious fixture.
2. Submit and assess its exact version.
3. Issue a community Tool Passport only for the passing fixture.
4. Verify the local signature and inspect the explicit assurance level.
5. Claim the synthetic observed agent and assign only the eligible intersection of agent capability, principal authority, and exact-version tool semantics.
6. Invoke the eligible tool through the WebMCP surface or clearly labeled fallback and inspect the signed evidence.
7. Attempt semantic drift, then revoke the Tool Passport to see the invocation block and available surface change.

All demo state and signing keys are ephemeral to the browser session.

## WebMCP registration

AgentGate feature-detects native WebMCP and exposes only tools whose exact assignment remains eligible. The native registration path uses the browser API directly:

```ts
document.modelContext.registerTool(definition);
```

The registered handler re-resolves the assignment and policy at invocation time. In browsers without WebMCP, the visible fallback runs the same provider and policy path instead of simulating native registration.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ASSESSMENT-CONTRACT.md](docs/ASSESSMENT-CONTRACT.md), [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md), the exact [three-minute demo script](docs/DEMO-SCRIPT.md), the [submission brief](docs/SUBMISSION.md), and the [release checklist](docs/RELEASE-CHECKLIST.md).

Security reports should follow [SECURITY.md](SECURITY.md). Contributions should follow [CONTRIBUTING.md](CONTRIBUTING.md). FLINT names and verification marks are governed separately from the source license; see [TRADEMARKS.md](TRADEMARKS.md).

## Source-informed boundaries

The initial scanner architecture borrows proven ideas without binding FLINT's public contract to another project's unstable output:

- [Snyk Agent Scan](https://github.com/snyk/agent-scan): broad local discovery, MCP and skill risk categories, explicit consent before commands are run.
- [Visa Vulnerability Agentic Harness](https://github.com/visa/visa-vulnerability-agentic-harness): staged evidence, threat modeling, deterministic gates, standardized output, and adversarial validation.
- [WebMCP demo](https://www.youtube.com/watch?v=EoNH3Tn8wYE): browser-session tools, conditional exposure, and bring-your-own-agent journeys.

Future scanners integrate through adapters into the stable FLINT Assessment Contract. Snyk integration remains optional and requires an approved `SNYK_TOKEN` secret.

No Snyk or Visa source is vendored in this repository. Their projects informed the adapter and evidence architecture; future integrations must preserve applicable licenses, notices, and service terms.

## License

MIT
