import { useEffect, useMemo, useRef, useState } from "react";
import type { GatewayDecision, ObservedAgent } from "../domain/contracts";
import {
  buildCommunityFleet,
  type CommunityFleetAgent,
  type CommunityFleetTone,
} from "../constellation/communityFleet";

type CommunityFleetConstellationProps = {
  primaryName: string;
  primaryTool: string;
  primaryScope: string[];
  primaryMandate: string;
  lifecycleState: ObservedAgent["state"];
  assignmentActive: boolean;
  verdict?: GatewayDecision["verdict"];
  revoked: boolean;
  invoking: boolean;
  invocationSequence: number;
};

type Point = { x: number; y: number };

const TONE_LABEL: Record<CommunityFleetTone, string> = {
  local: "Local",
  governed: "Governed",
  allow: "Allow",
  review: "Review",
  block: "Block",
  revoked: "Revoked",
};

const INSPECTOR_DISMISS_MS = 6_000;

function sourceLabel(agent: CommunityFleetAgent) {
  if (agent.source === "instrumented-demo") return "Instrumented demo surface";
  if (agent.source === "flint-valid-sample") return "Simulated FLINT-valid sample";
  if (agent.source === "drift-alert-sample") return "Simulated authority drift";
  return "Local sample declaration";
}

export function CommunityFleetConstellation(props: CommunityFleetConstellationProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const positionsRef = useRef(new Map<string, Point>());
  const agentsRef = useRef<CommunityFleetAgent[]>([]);
  const popoutRef = useRef<HTMLDivElement>(null);
  const packetRef = useRef<HTMLSpanElement>(null);
  const packetStartedAtRef = useRef<number | null>(null);
  const activeAgentIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const [pinnedAgentId, setPinnedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const agents = useMemo(
    () => buildCommunityFleet({
      primaryName: props.primaryName,
      primaryTool: props.primaryTool,
      primaryScope: props.primaryScope,
      primaryMandate: props.primaryMandate,
      lifecycleState: props.lifecycleState,
      assignmentActive: props.assignmentActive,
      verdict: props.verdict,
      revoked: props.revoked,
    }),
    [
      props.assignmentActive,
      props.lifecycleState,
      props.primaryMandate,
      props.primaryName,
      props.primaryScope,
      props.primaryTool,
      props.revoked,
      props.verdict,
    ],
  );

  const activeAgentId = hoveredAgentId ?? pinnedAgentId;
  const activeAgent = agents.find((agent) => agent.id === activeAgentId);
  agentsRef.current = agents;
  activeAgentIdRef.current = activeAgent?.id ?? null;

  const inspectAgent = (agentId: string) => {
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    if (pinnedAgentId === agentId) {
      setPinnedAgentId(null);
      dismissTimerRef.current = null;
      return;
    }
    setPinnedAgentId(agentId);
    dismissTimerRef.current = window.setTimeout(() => {
      setPinnedAgentId(null);
      dismissTimerRef.current = null;
    }, INSPECTOR_DISMISS_MS);
  };

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => () => {
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
  }, []);

  useEffect(() => {
    if (props.invocationSequence <= 0) return;
    packetStartedAtRef.current = performance.now();
    if (packetRef.current) packetRef.current.hidden = reducedMotion;
  }, [props.invocationSequence, reducedMotion]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    let width = 0;
    let height = 0;
    let raf = 0;
    const startedAt = performance.now();

    const positionPopout = () => {
      const popout = popoutRef.current;
      const selectedId = activeAgentIdRef.current;
      const position = selectedId ? positionsRef.current.get(selectedId) : undefined;
      if (!popout || !position || width === 0 || height === 0) return;

      const popoutWidth = Math.min(258, Math.max(210, width - 24));
      const popoutHeight = 196;
      let x: number;
      let y: number;

      if (width < 620) {
        x = 12;
        y = height - popoutHeight - 12;
      } else {
        const onRight = position.x >= width / 2;
        x = onRight ? position.x + 30 : position.x - popoutWidth - 30;
        y = position.y - popoutHeight / 2;
        x = Math.min(Math.max(12, x), width - popoutWidth - 12);
        y = Math.min(Math.max(12, y), height - popoutHeight - 12);
      }

      popout.style.width = `${popoutWidth}px`;
      popout.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const renderFrame = (now: number) => {
      const elapsedSeconds = reducedMotion ? 0 : (now - startedAt) / 1000;
      const centerX = width / 2;
      const centerY = height / 2;

      for (const agent of agentsRef.current) {
        const node = nodeRefs.current.get(agent.id);
        if (!node) continue;
        const angle = agent.orbit.phase + (elapsedSeconds / agent.orbit.periodSeconds) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * width * agent.orbit.radiusX;
        const y = centerY + Math.sin(angle) * height * agent.orbit.radiusY;
        positionsRef.current.set(agent.id, { x, y });
        node.style.transform = `translate3d(${x}px, ${y}px, 0) translate3d(-50%, -50%, 0)`;
      }

      positionPopout();

      const packet = packetRef.current;
      const packetStartedAt = packetStartedAtRef.current;
      const source = positionsRef.current.get("primary-demo-agent");
      if (packet && packetStartedAt !== null && source) {
        const progress = Math.min(1, (now - packetStartedAt) / 900);
        const eased = 1 - Math.pow(1 - progress, 3);
        const x = source.x + (centerX - source.x) * eased;
        const y = source.y + (centerY - source.y) * eased;
        packet.hidden = false;
        packet.style.opacity = progress > 0.86 ? String((1 - progress) / 0.14) : "1";
        packet.style.transform = `translate3d(${x}px, ${y}px, 0) translate3d(-50%, -50%, 0)`;
        if (progress >= 1) {
          packet.hidden = true;
          packetStartedAtRef.current = null;
        }
      }
    };

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(360, rect.height);
      renderFrame(performance.now());
    };

    const frame = (now: number) => {
      renderFrame(now);
      raf = requestAnimationFrame(frame);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    if (!reducedMotion) raf = requestAnimationFrame(frame);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <section className="panel constellation-panel" aria-labelledby="community-fleet-title">
      <div className="constellation-heading">
        <div>
          <p className="eyebrow">COMMUNITY FLEET CONSTELLATION</p>
          <h2 id="community-fleet-title">See declared agents move through the local trust plane</h2>
          <p>Hover or focus a node to inspect it. Click to pin the inspector for six seconds.</p>
        </div>
        <div className="constellation-boundary" aria-label="Visualization boundary">
          <span>7 SAMPLE AGENTS</span>
          <span>1 INSTRUMENTED</span>
          <span>LOCAL DATA</span>
        </div>
      </div>

      <div className="constellation-stage" ref={stageRef}>
        <div className="orbit-ring orbit-ring-one" aria-hidden="true" />
        <div className="orbit-ring orbit-ring-two" aria-hidden="true" />
        <div className="orbit-ring orbit-ring-three" aria-hidden="true" />

        <div className="constellation-core" aria-label="Local AgentGate gateway">
          <span className="constellation-core-mark">
            <img src="/assets/flint-command-icon-blue.png" alt="" />
          </span>
          <strong>AGENTGATE</strong>
          <span>LOCAL GATEWAY</span>
        </div>

        {agents.map((agent) => (
          <button
            type="button"
            className={`constellation-agent tone-${agent.tone}${activeAgent?.id === agent.id ? " is-active" : ""}`}
            key={agent.id}
            ref={(node) => {
              if (node) nodeRefs.current.set(agent.id, node);
              else nodeRefs.current.delete(agent.id);
            }}
            onMouseEnter={() => setHoveredAgentId(agent.id)}
            onMouseLeave={() => setHoveredAgentId(null)}
            onFocus={() => setHoveredAgentId(agent.id)}
            onBlur={() => setHoveredAgentId(null)}
            onClick={() => inspectAgent(agent.id)}
            aria-label={`Inspect ${agent.name}`}
            aria-pressed={pinnedAgentId === agent.id}
          >
            {agent.assurance === "flint-passport-valid-sample" ? (
              <span className="agent-node-signal" aria-hidden="true">✓</span>
            ) : null}
            {agent.assurance === "mandate-drift-sample" ? (
              <span className="agent-node-signal" aria-hidden="true">!</span>
            ) : null}
            <span className="agent-node-code">{agent.code}</span>
            <span className="agent-node-label">{agent.name}</span>
          </button>
        ))}

        <span
          ref={packetRef}
          className={`gateway-packet tone-${agents[0].tone}${props.invoking ? " is-evaluating" : ""}`}
          hidden
          aria-hidden="true"
        />

        {activeAgent ? (
          <div className={`constellation-popout tone-${activeAgent.tone}`} ref={popoutRef} role="status">
            <div className="popout-heading">
              <div>
                <strong>{activeAgent.name}</strong>
                <span>{sourceLabel(activeAgent)}</span>
              </div>
              <span className="popout-state">{TONE_LABEL[activeAgent.tone]}</span>
            </div>
            <dl>
              <div><dt>Identity</dt><dd>{activeAgent.stateLabel}</dd></div>
              <div><dt>Tool</dt><dd>{activeAgent.tool}</dd></div>
              <div><dt>Scope</dt><dd>{activeAgent.scope.join(", ")}</dd></div>
              <div className="popout-mandate"><dt>Mandate</dt><dd>{activeAgent.mandate}</dd></div>
            </dl>
          </div>
        ) : null}

        <div className="constellation-legend" aria-label="Fleet state legend">
          <span><i className="legend-local" />Local declaration</span>
          <span><i className="legend-governed" />FLINT passport valid</span>
          <span><i className="legend-block" />Scope or mandate changed</span>
        </div>
      </div>

      <div className="constellation-disclosure">
        <p>Green and red nodes are simulated state examples. Community does not issue FLINT passports, discover every agent, or claim FLINT verification.</p>
        <a href="https://flint.network/command" target="_blank" rel="noreferrer">Explore FLINT Command</a>
      </div>
    </section>
  );
}
