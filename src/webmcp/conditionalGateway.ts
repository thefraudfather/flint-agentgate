import type { GatewayInvocationRequest } from "../gateway/runtimeGateway";
import type { RuntimeEvaluation, TrustProvider } from "../providers/trustProvider";

export type WebMcpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
};

export type ModelContextLike = {
  registerTool: (definition: WebMcpToolDefinition) => void | (() => void);
  unregisterTool?: (name: string) => void;
};

export type DocumentWithModelContext = {
  modelContext?: ModelContextLike;
};

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
}

export type GatewaySurfaceState = {
  supported: boolean;
  mode: "webmcp" | "fallback";
  eligibility: "registered" | "ineligible";
  detail: string;
};

export function supportsWebMcp(documentLike: DocumentWithModelContext | undefined): documentLike is {
  modelContext: ModelContextLike;
} {
  return typeof documentLike?.modelContext?.registerTool === "function";
}

export function getNativeWebMcpDocument(): DocumentWithModelContext | undefined {
  return typeof document === "undefined" ? undefined : document;
}

export function registerNativeWebMcpTool(definition: WebMcpToolDefinition): void | (() => void) {
  if (typeof document === "undefined" || !supportsWebMcp(document)) {
    throw new Error("WebMCP is unavailable in this browser.");
  }
  return document.modelContext.registerTool(definition);
}

export class ConditionalWebMcpGateway {
  readonly provider: TrustProvider;
  readonly documentLike?: DocumentWithModelContext;
  #registered = new Map<string, { assignmentId: string; toolPassportId: string; artifactDigest: string; dispose?: () => void }>();

  constructor(provider: TrustProvider, documentLike = getNativeWebMcpDocument()) {
    this.provider = provider;
    this.documentLike = documentLike;
  }

  #remove(name: string) {
    const current = this.#registered.get(name);
    if (!current) return;
    if (current.dispose) current.dispose();
    else this.documentLike?.modelContext?.unregisterTool?.(name);
    this.#registered.delete(name);
  }

  dispose() {
    for (const name of [...this.#registered.keys()]) this.#remove(name);
  }

  sync(input: {
    assignmentId: string;
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    buildRequest: (toolInput: unknown) => GatewayInvocationRequest;
    now?: string;
  }): GatewaySurfaceState {
    const assignmentId = input.assignmentId;
    let toolPassportId: string;
    let artifactDigest: string;
    try {
      const resolved = this.provider.resolveAssignment(assignmentId, { now: input.now });
      if (input.name !== resolved.credential.passport.toolName) {
        throw new Error("WebMCP tool name does not match its Tool Passport.");
      }
      toolPassportId = resolved.credential.passport.id;
      artifactDigest = resolved.credential.passport.artifactDigest;
    } catch (error) {
      this.#remove(input.name);
      return {
        supported: supportsWebMcp(this.documentLike),
        mode: supportsWebMcp(this.documentLike) ? "webmcp" : "fallback",
        eligibility: "ineligible",
        detail: error instanceof Error ? error.message : "Assignment is not eligible.",
      };
    }

    if (!supportsWebMcp(this.documentLike)) {
      return {
        supported: false,
        mode: "fallback",
        eligibility: "registered",
        detail: "WebMCP is unavailable in this browser. The visible fallback invokes the same AgentGate policy path.",
      };
    }

    const current = this.#registered.get(input.name);
    if (current?.assignmentId === assignmentId && current.toolPassportId === toolPassportId && current.artifactDigest === artifactDigest) {
      return { supported: true, mode: "webmcp", eligibility: "registered", detail: "Eligible tool is registered through WebMCP." };
    }
    this.#remove(input.name);
    const definition: WebMcpToolDefinition = {
      name: input.name,
      description: input.description,
      inputSchema: input.inputSchema ?? { type: "object", properties: {}, additionalProperties: true },
      execute: async (toolInput) => {
        // Eligibility is deliberately resolved again at invocation time so a stale
        // browser registration cannot survive a freeze, revocation, or expiry.
        const request = input.buildRequest(toolInput);
        if (request.assignmentId !== assignmentId) {
          throw new Error("AgentGate BLOCK: REGISTRATION_ASSIGNMENT_MISMATCH");
        }
        const resolved = this.provider.resolveAssignment(assignmentId, { now: input.now });
        if (resolved.credential.passport.id !== toolPassportId || resolved.credential.passport.artifactDigest !== artifactDigest) {
          throw new Error("AgentGate BLOCK: REGISTRATION_TOOL_VERSION_MISMATCH");
        }
        const result = await this.provider.evaluateInvocation(request, { now: input.now });
        if (result.decision.verdict !== "ALLOW") {
          throw new Error(`AgentGate ${result.decision.verdict}: ${result.decision.reasonCodes.join(", ")}`);
        }
        return result;
      },
    };
    const dispose = this.documentLike === getNativeWebMcpDocument()
      ? registerNativeWebMcpTool(definition)
      : this.documentLike.modelContext.registerTool(definition);
    this.#registered.set(input.name, { assignmentId, toolPassportId, artifactDigest, dispose: typeof dispose === "function" ? dispose : undefined });
    return { supported: true, mode: "webmcp", eligibility: "registered", detail: "Eligible tool is registered through WebMCP." };
  }

  invokeFallback(request: GatewayInvocationRequest, options: { now?: string } = {}): Promise<RuntimeEvaluation> {
    return this.provider.evaluateInvocation(request, options);
  }
}
