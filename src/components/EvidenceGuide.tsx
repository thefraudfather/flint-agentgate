const guideSteps = [
  {
    title: "Assess the tool",
    body: "Submit 1 declared tool version. The Community Scanner checks the submitted manifest and instructions. It does not download, install, or run the tool.",
  },
  {
    title: "Issue a local Tool Passport",
    body: "A passing version can receive a locally signed Community credential. The signature detects changes to the record. It does not mean FLINT verified the tool.",
  },
  {
    title: "Register the agent and its authority",
    body: "Bind the agent to an organization and authorizing principal. Record what the agent can do, what it may do, and why.",
  },
  {
    title: "Create the permitted assignment",
    body: "AgentGate exposes only the overlap between the agent's capability, the principal's authority, the exact tool contract, and the requested assignment.",
  },
  {
    title: "Evaluate each tool request",
    body: "The Gateway checks the current records and request context. It returns a verdict and creates signed evidence showing what was checked.",
  },
] as const;

const glossaryGroups = [
  {
    title: "People, products, and connections",
    entries: [
      {
        term: "Agent",
        definition: "Software that selects or takes actions for a principal.",
      },
      {
        term: "Principal",
        definition: "The person, organization, or system that authorizes an agent.",
      },
      {
        term: "MCP and WebMCP",
        definition: "MCP connects agents to tools. WebMCP provides the browser tool surface used when supported.",
      },
      {
        term: "Gateway",
        definition: "The control point that decides whether a tool is available and whether a request may proceed.",
      },
      {
        term: "AgentGate Community",
        definition: "The cloneable local reference implementation. It uses browser-session records and locally signed credentials.",
      },
      {
        term: "FLINT Command",
        definition: "The managed product path for organizational identity, FLINT-controlled assurance, monitoring, lifecycle operations, and enterprise evidence workflows.",
      },
    ],
  },
  {
    title: "Artifacts, identity, and assurance",
    entries: [
      {
        term: "Artifact and exact version",
        definition: "The submitted tool definition bound to 1 named version. A change requires another assessment.",
      },
      {
        term: "Artifact digest",
        definition: "A SHA-256 fingerprint used to identify the exact submitted artifact.",
      },
      {
        term: "Agent build fingerprint",
        definition: "A declared SHA-256 identifier for 1 agent build. Community does not independently verify it.",
      },
      {
        term: "Agent Passport",
        definition: "A versioned identity record binding an agent to its organization and principal.",
      },
      {
        term: "Tool Passport",
        definition: "A signed credential binding 1 assessed tool version, digest, assessment, status, and expiration.",
      },
      {
        term: "FLINT Stamp",
        definition: "FLINT-controlled assurance for an exact artifact version after the required managed assessment and review. Community cannot issue one.",
      },
      {
        term: "Community self-attested",
        definition: "The local application signs information supplied to it. The signature detects changes but does not prove the information is true.",
      },
    ],
  },
  {
    title: "Authority and scope",
    entries: [
      {
        term: "Capability Claim, CAN",
        definition: "What the agent build claims it can technically do. A claim is not permission.",
      },
      {
        term: "Semantic Authority Grant, MAY",
        definition: "What the principal authorizes the agent to do, for which purpose, resources, destinations, data, effects, and period.",
      },
      {
        term: "Tool Semantic Contract, TOOL",
        definition: "The limits declared for the exact assessed tool version.",
      },
      {
        term: "Assignment Grant, MAY NOW",
        definition: "The active subset the agent may use through the Gateway now.",
      },
      {
        term: "Semantic intersection",
        definition: "The overlap among capability, authority, tool limits, assignment, and request context.",
      },
      {
        term: "Mandate or purpose",
        definition: "The approved reason for the agent's activity.",
      },
      {
        term: "Resource pattern and permitted root",
        definition: "A resource pattern identifies an exact resource or prefix, such as catalog://approved/*. A permitted root is the broadest resource path the principal allows.",
      },
      {
        term: "Destination, data class, and side effect",
        definition: "A destination is a host or service the tool may contact. A data class describes the sensitivity of data involved. A side effect is a change caused outside the tool response, such as sending, deleting, purchasing, or writing.",
      },
    ],
  },
  {
    title: "Decisions and evidence",
    entries: [
      {
        term: "Lifecycle states",
        definition: "Observed means activity was seen. Correlated means evidence was linked. Verified means it was linked to a current identity record. Governed means it also has an active assignment. Community verification is local, not FLINT assurance.",
      },
      {
        term: "Instrumented surface and blind spot",
        definition: "An instrumented surface supplies evidence. A blind spot is activity the connected surfaces cannot measure.",
      },
      {
        term: "Deterministic check",
        definition: "An exact comparison of identity, version, status, scope, and request fields.",
      },
      {
        term: "Semantic check",
        definition: "A purpose-alignment check that runs only after exact checks pass. Community uses a bounded local evaluator.",
      },
      {
        term: "Assessment result",
        definition: "PASS, CONDITIONAL, FAIL, or ERROR describes the submitted tool version.",
      },
      {
        term: "Gateway verdict",
        definition: "ALLOW, STEP-UP, REVIEW, or BLOCK describes 1 tool request.",
      },
      {
        term: "Invocation Evidence Credential",
        definition: "Signed JSON recording the request, decision, reasons, identities, versions, and digests.",
      },
      {
        term: "Policy digest",
        definition: "A SHA-256 fingerprint of the policy records used for the decision.",
      },
      {
        term: "Fail closed",
        definition: "Stop the request when a required record or check is missing, invalid, or unavailable.",
      },
    ],
  },
] as const;

export function HowAgentGateWorks({ onStart }: { onStart: () => void }) {
  return (
    <section className="panel evidence-guide guide-how-it-works" aria-labelledby="how-agentgate-works-heading">
      <div className="panel-header evidence-guide-heading">
        <div>
          <p className="eyebrow">HOW AGENTGATE WORKS</p>
          <h2 id="how-agentgate-works-heading">Check a tool before an agent can use it</h2>
          <p>AgentGate checks the tool, the agent, and the principal's authority before making a capability available.</p>
        </div>
      </div>

      <ol className="guide-step-list">
        {guideSteps.map((step, index) => (
          <li className="guide-step" key={step.title}>
            <span className="guide-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <aside className="managed-callout guide-boundary" aria-label="Community and Command boundary">
        <div>
          <strong>Community proves the local workflow</strong>
          <p>AgentGate Community stores records and creates signatures in this browser. Community signatures can detect changes to a record. They do not mean FLINT verified the agent or tool.</p>
          <p>FLINT Command is the managed product for organizational identity, monitoring, lifecycle operations, and FLINT-controlled assurance.</p>
        </div>
        <a href="https://flint.network/command" target="_blank" rel="noreferrer">Explore FLINT Command</a>
      </aside>

      <button className="primary-button guide-action" type="button" onClick={onStart}>Start guided safe path</button>
    </section>
  );
}

export function AgentGateGlossary() {
  return (
    <section className="panel evidence-guide agentgate-glossary" aria-labelledby="agentgate-glossary-heading">
      <div className="panel-header evidence-guide-heading">
        <div>
          <p className="eyebrow">PLAIN-LANGUAGE REFERENCE</p>
          <h2 id="agentgate-glossary-heading">AgentGate glossary</h2>
          <p>These definitions describe what each term means in this Community demo.</p>
        </div>
      </div>

      <div className="glossary-groups">
        {glossaryGroups.map((group) => (
          <section className="glossary-group" aria-labelledby={`glossary-${group.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`} key={group.title}>
            <h3 id={`glossary-${group.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`}>{group.title}</h3>
            <dl className="glossary-list">
              {group.entries.map((entry) => (
                <div className="glossary-entry" key={entry.term}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}
