# FLINT AgentGate

FLINT AgentGate is an enterprise trust gateway for AI agents and MCP tools. It combines a verified identity registry, semantic authority, exact-version tool assessments, runtime policy enforcement, and signed evidence.

This repository is an isolated hackathon prototype. It does not modify or deploy the production FLINT MVP.

## What is implemented

- Versioned contracts for principals, agent identities, semantic authority, tool submissions, assessments, FLINT Stamps, Tool Passports, assignments, gateway decisions, and invocation evidence.
- A bounded deterministic scanner for manifest, schema, annotation, instruction, destination, and toxic-combination risks.
- A fail-closed assessment ledger with explicit scanner version, policy version and digest, required-check coverage, bounded errors, and blind spots.
- A hard Stamp issuance gate requiring a fresh complete production PASS and an approved evidence-bearing review.
- A gateway evaluator that requires the intersection of agent authority, active Tool Passport, active assignment, and request context.
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

The local development server binds to `127.0.0.1:4173`.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ASSESSMENT-CONTRACT.md](docs/ASSESSMENT-CONTRACT.md), and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Source-informed boundaries

The initial scanner architecture borrows proven ideas without binding FLINT's public contract to another project's unstable output:

- [Snyk Agent Scan](https://github.com/snyk/agent-scan): broad local discovery, MCP and skill risk categories, explicit consent before commands are run.
- [Visa Vulnerability Agentic Harness](https://github.com/visa/visa-vulnerability-agentic-harness): staged evidence, threat modeling, deterministic gates, standardized output, and adversarial validation.
- [WebMCP demo](https://www.youtube.com/watch?v=EoNH3Tn8wYE): browser-session tools, conditional exposure, and bring-your-own-agent journeys.

Future scanners integrate through adapters into the stable FLINT Assessment Contract. Snyk integration remains optional and requires an approved `SNYK_TOKEN` secret.

## License

MIT
