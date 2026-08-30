import type { ToolPassportCredential } from "../domain/contracts";
import type { IdentityRegistryDraft, RegistryScopeDraft } from "../registry/demoRegistry";

type IdentityRegistryFormProps = {
  credential: ToolPassportCredential;
  draft: IdentityRegistryDraft;
  disabled: boolean;
  onChange: (draft: IdentityRegistryDraft) => void;
};

const dataClasses: RegistryScopeDraft["dataClasses"] = [
  "public",
  "internal",
  "confidential",
  "restricted",
  "payment",
  "personal",
];

function splitList(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function joinList(value: string[]) {
  return value.join(", ");
}

function RegistryScopeEditor({
  label,
  code,
  description,
  action,
  scope,
  disabled,
  onChange,
}: {
  label: string;
  code: string;
  description: string;
  action: string;
  scope: RegistryScopeDraft;
  disabled: boolean;
  onChange: (scope: RegistryScopeDraft) => void;
}) {
  return (
    <fieldset className="registry-scope" disabled={disabled}>
      <legend><b>{code}</b>{label}</legend>
      <p>{description}</p>
      <label>
        <span>Bound action</span>
        <input value={action} readOnly aria-readonly="true" />
      </label>
      <label>
        <span>Resource patterns</span>
        <input value={joinList(scope.resources)} onChange={(event) => onChange({ ...scope, resources: splitList(event.target.value) })} />
        <small>Comma-separated exact paths or directional wildcards.</small>
      </label>
      <label>
        <span>Destinations</span>
        <input value={joinList(scope.destinations)} onChange={(event) => onChange({ ...scope, destinations: splitList(event.target.value) })} />
      </label>
      <label>
        <span>Side effects</span>
        <input value={joinList(scope.sideEffects)} onChange={(event) => onChange({ ...scope, sideEffects: splitList(event.target.value) })} />
      </label>
      <div className="registry-data-classes">
        <span>Data classes</span>
        <div>
          {dataClasses.map((dataClass) => (
            <label key={dataClass}>
              <input
                type="checkbox"
                checked={scope.dataClasses.includes(dataClass)}
                onChange={(event) => onChange({
                  ...scope,
                  dataClasses: event.target.checked
                    ? [...scope.dataClasses, dataClass]
                    : scope.dataClasses.filter((item) => item !== dataClass),
                })}
              />
              <span>{dataClass}</span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

export function IdentityRegistryForm({ credential, draft, disabled, onChange }: IdentityRegistryFormProps) {
  const change = <Key extends keyof IdentityRegistryDraft>(
    key: Key,
    value: IdentityRegistryDraft[Key],
  ) => onChange({ ...draft, [key]: value });

  return (
    <div className="identity-registry-form">
      <section className="registry-form-section" aria-labelledby="identity-binding-heading">
        <div className="registry-form-heading">
          <div>
            <p className="eyebrow">IDENTITY BINDING</p>
            <h3 id="identity-binding-heading">Organization, principal, and agent</h3>
          </div>
          <span>Identity remains separate from mutable authority.</span>
        </div>

        <fieldset className="registry-identity-grid" disabled={disabled}>
          <label>
            <span>Organization name</span>
            <input value={draft.organization.displayName} onChange={(event) => change("organization", { ...draft.organization, displayName: event.target.value })} />
          </label>
          <label>
            <span>Organization ID</span>
            <input value={draft.organization.id} onChange={(event) => change("organization", { ...draft.organization, id: event.target.value })} />
          </label>
          <label>
            <span>Authorizing principal</span>
            <input value={draft.principal.displayName} onChange={(event) => change("principal", { ...draft.principal, displayName: event.target.value })} />
          </label>
          <label>
            <span>Principal ID</span>
            <input value={draft.principal.id} onChange={(event) => change("principal", { ...draft.principal, id: event.target.value })} />
          </label>
          <label>
            <span>Agent display name</span>
            <input value={draft.agent.displayName} onChange={(event) => change("agent", { ...draft.agent, displayName: event.target.value })} />
          </label>
          <label>
            <span>Agent Passport ID</span>
            <input value={draft.agent.id} onChange={(event) => change("agent", { ...draft.agent, id: event.target.value })} />
          </label>
          <label className="registry-span-two">
            <span>Agent build fingerprint</span>
            <input value={draft.agent.fingerprint} spellCheck={false} onChange={(event) => change("agent", { ...draft.agent, fingerprint: event.target.value })} />
            <small>SHA-256 identity binding for this declared agent build. It is not a FLINT verification claim.</small>
          </label>
        </fieldset>
      </section>

      <section className="registry-form-section" aria-labelledby="observation-heading">
        <div className="registry-form-heading">
          <div>
            <p className="eyebrow">DISCOVERY EVIDENCE</p>
            <h3 id="observation-heading">Observed identity and coverage</h3>
          </div>
          <span>Confidence applies only to named, instrumented surfaces.</span>
        </div>

        <fieldset className="registry-identity-grid" disabled={disabled}>
          <label>
            <span>Observed Agent ID</span>
            <input value={draft.observation.id} onChange={(event) => change("observation", { ...draft.observation, id: event.target.value })} />
          </label>
          <label>
            <span>Observation confidence</span>
            <input type="number" min="0" max="100" value={draft.observation.confidence} onChange={(event) => change("observation", { ...draft.observation, confidence: Number(event.target.value) })} />
          </label>
          <label>
            <span>Evidence sources</span>
            <input value={joinList(draft.observation.evidenceSources)} onChange={(event) => change("observation", { ...draft.observation, evidenceSources: splitList(event.target.value) })} />
          </label>
          <label>
            <span>Instrumented surfaces</span>
            <input value={joinList(draft.observation.instrumentedSurfaces)} onChange={(event) => change("observation", { ...draft.observation, instrumentedSurfaces: splitList(event.target.value) })} />
          </label>
          <label className="registry-span-two">
            <span>Known blind spots</span>
            <input value={joinList(draft.observation.blindSpots)} onChange={(event) => change("observation", { ...draft.observation, blindSpots: splitList(event.target.value) })} />
          </label>
        </fieldset>
      </section>

      <section className="registry-form-section" aria-labelledby="semantic-intersection-heading">
        <div className="registry-form-heading">
          <div>
            <p className="eyebrow">SEMANTIC INTERSECTION</p>
            <h3 id="semantic-intersection-heading">Define what may be exposed now</h3>
          </div>
          <span>Every requested value must fit inside all three upstream envelopes.</span>
        </div>

        <div className="registry-scope-grid">
          <RegistryScopeEditor
            code="CAN"
            label="Agent capability"
            description="What this agent build claims it can technically do."
            action={credential.passport.toolName}
            scope={draft.capability}
            disabled={disabled}
            onChange={(capability) => change("capability", capability)}
          />

          <div className="registry-authority-column">
            <RegistryScopeEditor
              code="MAY"
              label="Principal authority"
              description="What the named principal authorizes for a defined purpose."
              action={credential.passport.toolName}
              scope={draft.authority}
              disabled={disabled}
              onChange={(authority) => change("authority", { ...draft.authority, ...authority })}
            />
            <fieldset className="registry-authority-details" disabled={disabled}>
              <label>
                <span>Purpose and mandate</span>
                <textarea rows={3} value={draft.authority.purpose} onChange={(event) => change("authority", { ...draft.authority, purpose: event.target.value })} />
              </label>
              <label>
                <span>Permitted roots</span>
                <input value={joinList(draft.authority.permittedRoots)} onChange={(event) => change("authority", { ...draft.authority, permittedRoots: splitList(event.target.value) })} />
              </label>
              <label>
                <span>Denied actions</span>
                <input value={joinList(draft.authority.deniedActions)} onChange={(event) => change("authority", { ...draft.authority, deniedActions: splitList(event.target.value) })} />
              </label>
              <label>
                <span>Conditions</span>
                <input value={joinList(draft.authority.conditions)} onChange={(event) => change("authority", { ...draft.authority, conditions: splitList(event.target.value) })} />
              </label>
              <label>
                <span>Transaction ceiling, USD</span>
                <input
                  type="number"
                  min="0"
                  value={draft.authority.maxTransactionUsd ?? ""}
                  placeholder="Not applicable"
                  onChange={(event) => change("authority", {
                    ...draft.authority,
                    maxTransactionUsd: event.target.value === "" ? undefined : Number(event.target.value),
                  })}
                />
              </label>
            </fieldset>
          </div>

          <RegistryScopeEditor
            code="TOOL"
            label="Exact-version contract"
            description={`Tool Passport ${credential.passport.artifactVersion} limits the assessed artifact.`}
            action={credential.passport.toolName}
            scope={draft.toolContract}
            disabled={disabled}
            onChange={(toolContract) => change("toolContract", toolContract)}
          />

          <RegistryScopeEditor
            code="MAY NOW"
            label="Requested assignment"
            description="The narrow subset to expose through the Gateway now."
            action={credential.passport.toolName}
            scope={draft.assignment}
            disabled={disabled}
            onChange={(assignment) => change("assignment", assignment)}
          />
        </div>
      </section>
    </div>
  );
}
