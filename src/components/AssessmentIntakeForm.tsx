import type { ArtifactManifest } from "../domain/contracts";

export type AssessmentPreset = "safe" | "risky" | "custom";

type AssessmentIntakeFormProps = {
  manifest: ArtifactManifest;
  preset: AssessmentPreset;
  schemaDraft: string;
  schemaError?: string;
  disabled: boolean;
  onPresetChange: (preset: Exclude<AssessmentPreset, "custom">) => void;
  onManifestChange: (manifest: ArtifactManifest) => void;
  onSchemaDraftChange: (value: string) => void;
};

const dataClasses: ArtifactManifest["tools"][number]["dataClasses"] = [
  "public",
  "internal",
  "confidential",
  "restricted",
  "payment",
  "personal",
];

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function joinList(value: string[]) {
  return value.join(", ");
}

export function AssessmentIntakeForm({
  manifest,
  preset,
  schemaDraft,
  schemaError,
  disabled,
  onPresetChange,
  onManifestChange,
  onSchemaDraftChange,
}: AssessmentIntakeFormProps) {
  const tool = manifest.tools[0];
  const changeTool = (nextTool: ArtifactManifest["tools"][number]) => {
    onManifestChange({ ...manifest, tools: [nextTool, ...manifest.tools.slice(1)] });
  };

  return (
    <div className="assessment-intake-form">
      <div className="fixture-switch" role="group" aria-label="Assessment starting point">
        <button type="button" className={preset === "safe" ? "selected" : ""} disabled={disabled} onClick={() => onPresetChange("safe")}>Safe example</button>
        <button type="button" className={preset === "risky" ? "selected" : ""} disabled={disabled} onClick={() => onPresetChange("risky")}>Risky example</button>
        <span className={preset === "custom" ? "fixture-custom active" : "fixture-custom"}>CUSTOM INPUT</span>
      </div>

      <fieldset className="intake-fieldset" disabled={disabled}>
        <legend>Publisher and artifact</legend>
        <div className="intake-grid">
          <label>
            <span>Publisher name</span>
            <input
              value={manifest.publisher.displayName}
              onChange={(event) => onManifestChange({
                ...manifest,
                publisher: { ...manifest.publisher, displayName: event.target.value },
              })}
            />
          </label>
          <label>
            <span>Source URL</span>
            <input
              type="url"
              value={manifest.artifact.sourceUri}
              onChange={(event) => onManifestChange({
                ...manifest,
                artifact: { ...manifest.artifact, sourceUri: event.target.value },
              })}
            />
          </label>
          <label>
            <span>Artifact name</span>
            <input
              value={manifest.artifact.name}
              onChange={(event) => onManifestChange({
                ...manifest,
                artifact: { ...manifest.artifact, name: event.target.value },
              })}
            />
          </label>
          <label>
            <span>Exact version</span>
            <input
              value={manifest.artifact.version}
              onChange={(event) => onManifestChange({
                ...manifest,
                artifact: { ...manifest.artifact, version: event.target.value },
              })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="intake-fieldset" disabled={disabled}>
        <legend>Declared MCP tool</legend>
        <div className="intake-grid">
          <label>
            <span>Tool name</span>
            <input value={tool.name} onChange={(event) => changeTool({ ...tool, name: event.target.value })} />
          </label>
          <label>
            <span>Display title</span>
            <input value={tool.title} onChange={(event) => changeTool({ ...tool, title: event.target.value })} />
          </label>
          <label className="intake-span-two">
            <span>Description</span>
            <textarea rows={3} value={tool.description} onChange={(event) => changeTool({ ...tool, description: event.target.value })} />
          </label>
          <label>
            <span>Capabilities, comma separated</span>
            <input value={joinList(tool.capabilities)} onChange={(event) => changeTool({ ...tool, capabilities: splitList(event.target.value) })} />
          </label>
          <label>
            <span>Destinations, comma separated</span>
            <input value={joinList(tool.destinations)} placeholder="api.example.com" onChange={(event) => changeTool({ ...tool, destinations: splitList(event.target.value) })} />
          </label>
        </div>

        <div className="intake-choice-group">
          <span>Data classes</span>
          <div className="intake-check-grid">
            {dataClasses.map((dataClass) => (
              <label key={dataClass}>
                <input
                  type="checkbox"
                  checked={tool.dataClasses.includes(dataClass)}
                  onChange={(event) => changeTool({
                    ...tool,
                    dataClasses: event.target.checked
                      ? [...tool.dataClasses, dataClass]
                      : tool.dataClasses.filter((item) => item !== dataClass),
                  })}
                />
                <span>{dataClass}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="intake-choice-group">
          <span>Behavior annotations</span>
          <div className="intake-check-grid annotation-grid">
            {(Object.keys(tool.annotations) as Array<keyof typeof tool.annotations>).map((annotation) => (
              <label key={annotation}>
                <input
                  type="checkbox"
                  checked={tool.annotations[annotation]}
                  onChange={(event) => changeTool({
                    ...tool,
                    annotations: { ...tool.annotations, [annotation]: event.target.checked },
                  })}
                />
                <span>{annotation}</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="intake-fieldset" disabled={disabled}>
        <legend>Schema and instructions</legend>
        <label className="intake-code-field">
          <span>Input schema, JSON</span>
          <textarea
            rows={9}
            value={schemaDraft}
            aria-invalid={Boolean(schemaError)}
            aria-describedby={schemaError ? "schema-draft-error" : undefined}
            spellCheck={false}
            onChange={(event) => onSchemaDraftChange(event.target.value)}
          />
        </label>
        {schemaError ? <p className="field-error" id="schema-draft-error">{schemaError}</p> : null}
        <label className="intake-code-field">
          <span>Tool instructions</span>
          <textarea rows={5} value={manifest.instructions} onChange={(event) => onManifestChange({ ...manifest, instructions: event.target.value })} />
        </label>
      </fieldset>
    </div>
  );
}
