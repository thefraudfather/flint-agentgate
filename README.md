# FLINT AgentGate

FLINT AgentGate is an enterprise trust gateway for AI agents and MCP tools. It combines a versioned identity registry, semantic authority, exact-version tool assessments, runtime policy enforcement, and signed evidence.

This repository is an isolated hackathon prototype. It does not modify or deploy the production FLINT MVP.

**Try it:** [live demo](https://flint-agentgate.vercel.app) · [public demo video](https://youtu.be/NzE9xj_ylyM)

## Who it is for and what it proves

AgentGate is for hackathon judges, security teams, and agent-platform builders evaluating how an agent can receive only the exact tool authority it needs. In one browser session, the demo assesses a declared tool version, binds agent capability to principal authority and tool semantics, exposes the eligible capability, and produces signed local evidence for both allowed and blocked requests.

## Judge in 90 seconds

1. Open the [live demo](https://flint-agentgate.vercel.app) and select **Tool Assessments**.
2. Keep **Safe example**, select **Assess this tool version**, then **Issue community Tool Passport**.
3. In **Identity Registry**, select **Register identity and semantic authority**, then **Claim agent and assign eligible tool**.
4. In **Gateway Policy**, select **Run allowed request**, then **View signed evidence** to inspect and export the ALLOW record.
5. Return to **Gateway Policy**, select **Run out-of-mandate request** to see BLOCK, then **Revoke tool access** to remove the eligible surface.

The Gateway shows **Native WebMCP** when the browser API is available and **Browser demo** otherwise. Both routes use the same policy evaluator.

## Community and Command

This repository is the cloneable **AgentGate Community** reference implementation. It works without a FLINT account or third-party scanner credential. Community credentials are locally signed and explicitly marked `community-self-attested`; they are not a FLINT Stamp and do not represent FLINT verification.

**[FLINT Command](https://flint.network/command)** is the single managed assurance product for FLINT-controlled identity and Stamp issuance, continuous discovery and reassessment, proprietary detection, revocation, monitoring, enterprise controls, and network intelligence. The public provider and scanner interfaces keep Community compatible with that managed service without making it necessary for the local flow.

Community records authority conditions but does not interpret them during runtime policy evaluation. A configured transaction ceiling is evaluated only when an invocation supplies `transactionUsd`; the built-in demo request does not. See [custom input and troubleshooting](docs/CUSTOM-INPUT.md) before adapting the sample.

## Run locally

Prerequisites: Node.js 22–24 and npm 10 or newer.

```bash
git clone https://github.com/thefraudfather/flint-agentgate.git
cd flint-agentgate
npm ci
npm run dev
```

Open the printed URL (`http://127.0.0.1:4173` by default). Run `npm run release:check` for the complete release gate.

## What is implemented

- Versioned contracts for principals, agent identities, semantic authority, tool submissions, assessments, FLINT Stamps, Tool Passports, assignments, gateway decisions, and invocation evidence.
- A bounded deterministic scanner for manifest, schema, annotation, instruction, destination, and toxic-combination risks.
- An editable builder intake with publisher, source, artifact, exact version, tool identity, capability, destination, data-class, behavior, JSON Schema, and instruction fields.
- A fail-closed assessment ledger with explicit scanner version, policy version and digest, required-check coverage, bounded errors, and blind spots.
- A hard Stamp issuance gate requiring a fresh complete production PASS and an approved evidence-bearing review.
- A credential-free Community Scanner behind a stable scanner-adapter interface.
- Immutable publisher intake records and exact-version artifact bindings.
- Locally generated P-256 signing keys, signed community Tool Passports, and integrity verification.
- An assurance boundary that prevents community credentials from claiming a FLINT Stamp.
- A Local Trust Provider that can later be replaced by a managed Command provider without changing public contracts.
- Separate, versioned Agent Passport, Capability Claim, Semantic Authority Grant, Tool Semantic Contract, and Assignment Grant records.
- An editable Identity Registry intake for organization, principal, agent fingerprint, measured discovery evidence, capability, semantic authority, exact-version tool semantics, and requested assignment.
- An append-only authority revision ledger that classifies proposed changes, requires approval, blocks pending grants, and invalidates assignments bound to superseded authority.
- An assignment policy that rejects any requested action, resource, data class, destination, or side effect outside the complete authorization intersection.
- Distinct Observed, Correlated, Verified, and Governed agent states with evidence and blind-spot disclosure.
- A gateway evaluator that requires the intersection of agent authority, active Tool Passport, active assignment, exact tool semantics, and request context.
- A deterministic-first Semantic Integrity boundary that may escalate ALLOW to REVIEW or BLOCK but can never override a deterministic denial.
- Signed P-256 invocation evidence binding the decision to exact capability, authority, contract, assignment, artifact, input, and policy versions.
- Conditional `document.modelContext.registerTool` exposure with a truthful visible fallback when WebMCP is unavailable.
- Invocation-time eligibility re-resolution so freeze, revocation, and expiry remove the tool or deny stale registered handlers.
- A responsive Command-style interface with two clearly labeled demo artifacts.
- Functional Overview, Identity Registry, Tool Assessments, Gateway Policy, and Evidence Center views with prerequisite states and guided workflow transitions.
- A plain-language guide and glossary inside Evidence Center, plus browser-session decision history with JSON copy and download controls.
- A responsive Community Fleet Constellation with seven moving agents, keyboard-accessible six-second inspection cards, simulated FLINT-valid and authority-drift states, and the live gateway decision state.
- Tests for the stable contracts, safe and risky assessments, and semantic authorization boundaries.

The constellation visualizes records supplied to the local clone. Its static green and red nodes are explicitly simulated examples; Community does not issue FLINT passports or claim autonomous network discovery or FLINT verification. Managed Command adds verified discovery, fingerprint correlation, continuous monitoring, historical analysis, and response controls.

The builder intake hashes and evaluates the submitted manifest fields. The source URL is provenance metadata in this prototype; Community does not fetch, clone, install, or execute the linked artifact. A PASS is eligibility for additional stamp review, not proof that an artifact is vulnerability-free. See [custom input and troubleshooting](docs/CUSTOM-INPUT.md) for accepted fields and common failures.

The default demo flow is:

1. Open **Tool Assessments** and load a safe or risky example, or edit the manifest fields into a custom submission.
2. Submit and assess its exact version.
3. Issue a community Tool Passport only for the passing fixture; the UI advances to **Identity Registry**.
4. Verify the local signature and inspect the explicit assurance level.
5. Review or edit the organization, principal, observed identity, capability claim, semantic authority, exact-version tool contract, and requested assignment, then register the records.
6. Optionally propose and approve a new authority version; pending revisions cannot authorize tools and approval supersedes the prior grant.
7. Claim the observed agent and assign only the preflighted eligible intersection; the UI advances to **Gateway Policy**.
8. Run the allowed request through the WebMCP surface or clearly labeled browser demo.
9. Open **Evidence Center** to inspect, copy, or download the signed record, then run the out-of-mandate request and revoke access from **Gateway Policy**.

All demo state and signing keys are ephemeral to the browser session.

## WebMCP registration

AgentGate feature-detects native WebMCP and exposes only tools whose exact assignment remains eligible. The native registration path uses the browser API directly:

```ts
document.modelContext.registerTool(definition);
```

The registered handler re-resolves the assignment and policy at invocation time. In browsers without WebMCP, the visible fallback runs the same provider and policy path instead of simulating native registration.

## Architecture

See [FLINT Command and the open-core boundary](docs/COMMAND.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ASSESSMENT-CONTRACT.md](docs/ASSESSMENT-CONTRACT.md), [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md), [custom input and troubleshooting](docs/CUSTOM-INPUT.md), the exact [three-minute demo script](docs/DEMO-SCRIPT.md), the [submission brief](docs/SUBMISSION.md), and the [release checklist](docs/RELEASE-CHECKLIST.md).

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
