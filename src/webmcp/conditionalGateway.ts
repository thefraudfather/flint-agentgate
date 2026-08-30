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

export class ConditionalWebMcpGateway {
  readonly provider: TrustProvider;
  readonly documentLike?: DocumentWithModelContext;
  #registered = new Map<string, { assignmentId: string; dispose?: () => void }>();

  constructor(provider: TrustProvider, documentLike?: DocumentWithModelContext) {
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

  sync(input: {
    assignmentId: string;
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    buildRequest: (toolInput: unknown) => GatewayInvocationRequest;
    now?: string;
  }): GatewaySurfaceState {
    try {
      this.provider.resolveAssignment(input.assignmentId, { now: input.now });
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
    if (current?.assignmentId === input.assignmentId) {
      return { supported: true, mode: "webmcp", eligibility: "registered", detail: "Eligible tool is registered through WebMCP." };
    }
    this.#remove(input.name);
    const dispose = this.documentLike.modelContext.registerTool({
      name: input.name,
      description: input.description,
      inputSchema: input.inputSchema ?? { type: "object", properties: {}, additionalProperties: true },
      execute: async (toolInput) => {
        // Eligibility is deliberately resolved again at invocation time so a stale
        // browser registration cannot survive a freeze, revocation, or expiry.
        const result = await this.provider.evaluateInvocation(input.buildRequest(toolInput), { now: input.now });
        if (result.decision.verdict !== "ALLOW") {
          throw new Error(`AgentGate ${result.decision.verdict}: ${result.decision.reasonCodes.join(", ")}`);
        }
        return result;
      },
    });
    this.#registered.set(input.name, { assignmentId: input.assignmentId, dispose: typeof dispose === "function" ? dispose : undefined });
    return { supported: true, mode: "webmcp", eligibility: "registered", detail: "Eligible tool is registered through WebMCP." };
  }

  invokeFallback(request: GatewayInvocationRequest, options: { now?: string } = {}): Promise<RuntimeEvaluation> {
    return this.provider.evaluateInvocation(request, options);
  }
}
