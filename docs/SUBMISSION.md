# FLINT AgentGate — WebMCP submission brief

## Submission status

This document describes the public release candidate. The live demo and public video are available below; the Devpost entry remains tracked in the release checklist.

| Artifact | Submission value |
| --- | --- |
| Project name | FLINT AgentGate |
| Public repository | https://github.com/thefraudfather/flint-agentgate |
| Live WebMCP URL | https://flint-agentgate.vercel.app |
| Public demo video | https://youtu.be/NzE9xj_ylyM |
| Managed product destination | https://flint.network/command |
| License | MIT for source; FLINT names and marks remain governed by `TRADEMARKS.md` |

## Elevator pitch

FLINT AgentGate discovers AI agents, binds versioned identities to semantic authority, screens their tools, and exposes only approved capabilities through a policy-enforced WebMCP gateway with signed evidence.

## What was built during the submission period

AgentGate was created as an isolated hackathon prototype after the WebMCP event opened. Its commit history preserves the implementation sequence: stable contracts, assessment and credential issuance, semantic identity and assignment, conditional WebMCP exposure, and the judge journey. It does not alter or repackage the existing production FLINT MVP.

The submission-period work includes:

- an observed-to-governed identity lifecycle with disclosed discovery blind spots;
- versioned Agent Passports, Capability Claims, Semantic Authority Grants, Tool Semantic Contracts, and Assignment Grants;
- deterministic artifact assessment and exact-version community Tool Passports;
- fail-closed authorization across action, resource, destination, data class, and side effect;
- invocation-time WebMCP eligibility checks and removal after revocation;
- signed decision evidence tied to exact policy and artifact versions;
- a Community Fleet Constellation that visualizes local declarations, explicitly simulated valid/drift states, and the instrumented demo agent without claiming universal discovery or Community-issued FLINT passports; and
- an editable builder assessment intake that validates and hashes custom manifest fields while never fetching or executing the linked artifact; and
- a visible fallback that uses the same policy path when native WebMCP is unavailable.

## Why WebMCP is the right surface

Native browser tools are powerful only when an agent can discover the right capability without inheriting ambient authority. AgentGate places identity, semantic scope, artifact assurance, and runtime policy in front of `document.modelContext.registerTool(...)`. Eligible tools are registered conditionally; revoked, expired, frozen, or out-of-scope tools are withheld or denied.

This makes WebMCP the last-mile capability surface and AgentGate the trust decision point. The human sees the registry, assessment, authority intersection, verdict, and signed evidence. The agent sees only the capability the current identity and assignment permit.

## Three-minute judge path

Use `docs/DEMO-SCRIPT.md` and the safe fixture:

1. Assess the exact artifact version and issue a locally signed Community Tool Passport.
2. Move a synthetic observation through Observed, Correlated, Verified, and Governed states.
3. Create an assignment from the intersection of capability, authority, and tool semantics.
4. Invoke the aligned capability and inspect the ALLOW evidence.
5. Run the out-of-mandate request and observe BLOCK.
6. Revoke the Tool Passport and observe the browser surface become unavailable.
7. Show the risky fixture failing assessment and therefore receiving no credential.

## Judge setup

For the local candidate:

```bash
npm ci
npm run release:check
npm run dev
```

Open the printed localhost URL. In a WebMCP-capable browser, AgentGate uses the native API. In other browsers, the UI labels the fallback clearly and executes the identical trust-provider path.

## Public/managed boundary

The cloneable Community implementation issues only ephemeral, locally signed, `community-self-attested` credentials. It cannot claim a FLINT Stamp. FLINT Command remains the managed assurance layer for FLINT-controlled identity, proprietary discovery and detection, Stamp issuance, continuous reassessment, revocation, monitoring, enterprise policy, and network intelligence.

## Rules evidence

The release checklist tracks the WebMCP Hackathon requirements for a working URL, public source with a visible open-source license, browser-agent functionality, implementation explanation, and a public video under three minutes. The tagged submission commit and deployed commit must be identical before the entry is frozen. See the official rules at https://webmcp.devpost.com/rules.
