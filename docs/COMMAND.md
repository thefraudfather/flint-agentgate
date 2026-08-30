# FLINT Command

FLINT Command is the managed control plane for organizational AI agents and the tools they use. It turns observed agent activity into governed identities, binds each identity to principal-issued semantic authority, exposes only eligible exact-version tools through the MCP Gateway, and preserves the resulting decisions as verifiable evidence.

AgentGate Community proves those mechanics in a public, cloneable reference implementation. FLINT Command adds the managed assurance, discovery, monitoring, and enterprise operations required to run them across a real organization.

> **Status boundary:** This document defines the Command architecture and open-core product boundary. It is not a claim that every managed capability below is generally available today. The code in this repository implements the Community column; managed capabilities are delivered and staged separately.

## Product boundary

| Capability | AgentGate Community | FLINT Command |
| --- | --- | --- |
| Identity Registry | Local, session-scoped records and synthetic fixtures | Hosted organizational registry with authoritative lifecycle operations |
| Credentials | Ephemeral `community-self-attested` credentials | FLINT-controlled issuance, verification, expiry, and revocation |
| Agent discovery | Declared or supplied observations on the demo surface | Continuous signal collection, correlation, and measured coverage on connected surfaces |
| Tool assessment | Bounded deterministic Community Scanner and stable adapter contract | Managed assessment orchestration, proprietary detector packs, reassessment, and review |
| Semantic policy | Structured contracts and deterministic intersection | Managed policy administration, change control, conflict analysis, and continuous evaluation |
| MCP Gateway | Local conditional exposure and fail-closed invocation checks | Managed enforcement, fleet policy, metering, and response operations |
| Evidence | Locally signed demonstration records | FLINT trust anchors, retention, monitoring, export, and enterprise evidence workflows |
| Operations | Resettable browser-session demonstration | SSO, SCIM, role-based access, SIEM integration, service levels, and support |

Community signatures can demonstrate payload integrity, but they are not a FLINT trust anchor. A Community assessment PASS is not a FLINT Stamp, and a Community clone cannot represent an agent or tool as FLINT verified.

## System architecture

```text
Named, connected observation surfaces
                |
                v
     Discovery and correlation
                |
                v
        Identity Registry  <------- Principal and organization policy
                |                         |
                |                         v
                |                Semantic Authority Grant
                |                         |
                v                         v
Agent Capability Claim -----> CAN / MAY / TOOL intersection
                                          |
Exact-version Tool Passport --------------+
and Tool Semantic Contract                |
                                          v
                                  Assignment Grant
                                          |
                                          v
                                     MCP Gateway
                                  expose -> evaluate
                                  invoke -> re-resolve
                                          |
                                          v
                                  Decision and evidence
                                          |
                                          v
                                  Command monitoring
```

The Registry is the source of identity and authority. The Gateway is the enforcement point. Command makes the current state, decisions, coverage, and control actions visible. WebMCP or MCP exposure is an output of authorization, never a source of authority.

## Identity Registry

The Registry does not compress identity, technical capability, and authority into one mutable profile. It resolves linked, versioned records so each claim has a clear issuer and lifecycle.

| Record | What it establishes |
| --- | --- |
| Organization | The policy and administrative boundary |
| Principal Identity | The human or organizational actor authorized to govern the agent |
| Observed Agent | A provisional identity candidate with evidence, confidence, connected surfaces, and blind spots |
| Agent Passport | The durable identity binding between the agent, organization, and principal |
| Agent Capability Claim | What the agent is technically capable of doing |
| Semantic Authority Grant | What the principal permits the agent to do, for which purpose, resources, data, destinations, side effects, limits, and validity window |
| Tool Passport | The assurance record for one assessed artifact version and digest |
| Tool Semantic Contract | What that exact tool version can do and affect |
| Assignment Grant | The narrow capability the agent may exercise with that exact tool version now |

An Agent Passport identifies an agent. It does not silently absorb mutable mandate terms. Capability and authority remain separate records so a builder declaration cannot become organizational permission and an authority change does not rewrite identity history.

## Evidence-backed identity states

Command distinguishes discovery evidence from governed identity:

1. **Observed:** Agent-like activity was seen on a named, connected surface. The source, time, confidence, and blind spots remain attached.
2. **Correlated:** Multiple signals or records resolve to the same provisional entity with stated confidence.
3. **Verified:** The observation is linked to a current Agent Passport or another supported verifiable identity record.
4. **Governed:** The verified agent also has a current, resolvable assignment inside active principal authority and organization policy.

These states are evidence claims, not a promise that every agent has been discovered. A governed agent on one instrumented gateway does not imply visibility into unconnected endpoints, direct API traffic, or other networks.

## Semantic authority: CAN, MAY, TOOL, MAY NOW

The core policy model keeps four questions separate:

| Envelope | Question | Source |
| --- | --- | --- |
| **CAN** | What can this agent technically do? | Agent Capability Claim |
| **MAY** | What has its principal authorized it to do? | Semantic Authority Grant |
| **TOOL** | What can this exact assessed tool version do? | Tool Semantic Contract and Tool Passport |
| **MAY NOW** | What is allowed for this assignment and request now? | The runtime intersection plus current organization and lifecycle state |

```text
MAY NOW
  = CAN
  intersect MAY
  intersect TOOL
  intersect organization policy
  intersect active Assignment Grant
  intersect current request context
```

The intersection covers actions, resources, systems, counterparties or destinations, data classes, side effects, transaction limits, conditions, expiry, and purpose. Resource types stay extensible; the model is not hard-coded to a drive, operating system, network, or payment rail.

Deterministic checks are authoritative and run outside the model. Semantic Integrity can detect purpose or intent drift and escalate an otherwise mechanically valid request to REVIEW or BLOCK. It cannot turn a deterministic denial into ALLOW, and provider failure does not return ALLOW.

## Discovery coverage and Fingerprint

Command measures coverage before it claims governance. The defensible metric is governed activity as a share of observed agent-like activity on specifically named, instrumented surfaces. Every coverage view should expose:

- the observed-event denominator;
- which sensors and surfaces contributed evidence;
- sensor health and collection window;
- correlation confidence;
- connected and unconnected surfaces;
- known blind spots.

Where integrated, Fingerprint contributes strong browser, device, session-continuity, bot, and risk signals. Those signals can strengthen correlation, but they do not by themselves prove an agent's principal, financial authority, mandate, or complete presence across an enterprise.

FLINT's role is to correlate evidence across connected identity, MCP and tool-call, API, transaction, wallet, account, and Registry surfaces, then bind the resulting entity to principal authority and signed history. Neither Community nor Command should claim 100 percent discovery or publish a percentage of all enterprise agents without a defensible denominator.

## MCP Gateway enforcement

The Gateway exposes only tools backed by a currently resolvable assignment. Before each invocation it re-resolves:

- organization, principal, and Agent Passport state;
- current Capability Claim and Semantic Authority Grant versions;
- the active exact-version Tool Passport and artifact digest;
- the matching Tool Semantic Contract and Assignment Grant;
- action, resource, destination, data, side-effect, amount, purpose, and time constraints;
- freeze, revocation, expiry, and policy state.

Any missing, stale, mismatched, expired, frozen, or revoked dependency fails closed. Conditional WebMCP registration can make an eligible operation appear or disappear with policy state, but a stale registered handler still has to pass the same invocation-time checks.

This design keeps prompts and tool descriptions from becoming an authorization boundary. A tool may describe a capability, but only the principal or an authorized organization operator can grant or expand authority.

## Versioned authority changes

AgentGate Community now demonstrates the enforcement core of the authority lifecycle:

1. An authorized operator proposes a mandate or scope change with a reason.
2. The Registry issues a new immutable Semantic Authority Grant version instead of editing the current grant in place.
3. The Registry classifies the resulting envelope as narrowing, expansion, mixed, or equivalent and renders the revision ledger.
4. Every dependent assignment is re-evaluated against the new grant.
5. Assignments that no longer resolve become stale or invalid immediately.
6. The Gateway denies stale handlers because invocation re-resolves the superseded authority version.

Managed Command extends this public enforcement proof with organization-specific approval policy, dual control for escalation, durable operator evidence, notifications, retention, and fleet-wide response orchestration.

Expansion and narrowing are not equivalent. Expansion may require stronger approval under organization policy; narrowing should still create a new record and preserve the prior state. Rollback means issuing another authorized revision, not erasing history.

The demonstration is concrete: a pending grant is unusable, approval supersedes the prior version, an old assignment fails closed, and only a new assignment against the approved version can resolve.

## Monitoring and evidence

Command presents one operational view over identity posture, assignments, Gateway decisions, drift, freeze and revocation events, and discovery coverage. The fleet constellation is a visualization of Registry and monitoring records, not evidence by itself.

Invocation evidence binds a decision to the exact identity, capability, authority, tool, artifact, assignment, request, and policy versions used at decision time. Public Community records use local ephemeral signatures. Managed Command adds FLINT-controlled trust anchors, retention, export, operator audit, and continuous monitoring.

Evidence should contain the minimum material needed to verify the decision. Digests, version identifiers, reason codes, timestamps, and bounded semantic evidence are preferred over raw prompts, credentials, private tool output, or unnecessary personal data.

Control-plane actions also need evidence. Assignment, approval, authority revision, freeze, unfreeze, revocation, and restoration should be attributable and auditable just like tool invocations.

## Open-core upgrade path

AgentGate Community is designed to be useful without a FLINT account and to provide a clean path into Command when an organization needs managed assurance.

1. **Clone and evaluate:** run the Local Trust Provider, Community Scanner, stable contracts, semantic intersection, Gateway fallback, and evidence flow.
2. **Integrate:** map internal identity and scanner results into the public Registry, assessment, and provider interfaces without changing the core contracts.
3. **Connect Command:** replace local provider operations with managed issuance, verification, discovery, policy, monitoring, and revocation services.
4. **Operate at fleet scale:** add enterprise identity administration, continuous reassessment, centralized evidence, network intelligence, metering, and support.

The open contracts and deterministic policy mechanics remain inspectable. FLINT-controlled issuer keys, verification marks, proprietary detection, tuned scoring, adversarial corpora, cross-organization intelligence, and managed operations remain commercial capabilities.

## Assurance and non-goals

- Community does not issue FLINT verification or a FLINT Stamp.
- PASS means the exact submitted version satisfied the checks and coverage recorded by that assessment; it does not mean vulnerability-free.
- Tool Passport and assessment results bind to one artifact digest and version. A changed artifact requires reassessment.
- Discovery coverage is limited to named, connected surfaces and must disclose blind spots.
- AgentGate is not an endpoint security product, filesystem sandbox, EDR, or network firewall.
- The Community scanner does not fetch, install, or execute arbitrary submitted code.
- Model output cannot override deterministic policy denial.

For implementation details, see [AgentGate architecture](ARCHITECTURE.md), the [Assessment Contract](ASSESSMENT-CONTRACT.md), and the [threat model](THREAT-MODEL.md).
