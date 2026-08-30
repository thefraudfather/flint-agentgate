import {
  type AuthorityChangeProposal,
  type SemanticAuthorityGrant,
} from "../domain/contracts";
import { everyPatternContained, everyValueContained, patternContains } from "./assignmentPolicy";

function maxIncludes(container?: number, candidate?: number) {
  return container === undefined || (candidate !== undefined && candidate <= container);
}

function ruleIncludes(
  container: SemanticAuthorityGrant["allow"][number],
  candidate: SemanticAuthorityGrant["allow"][number],
) {
  return patternContains(container.action, candidate.action)
    && everyPatternContained(candidate.resources, container.resources)
    && everyValueContained(candidate.dataClasses, container.dataClasses)
    && everyPatternContained(candidate.destinations, container.destinations)
    && container.conditions.every((condition) => candidate.conditions.includes(condition));
}

function authorityIncludes(container: SemanticAuthorityGrant, candidate: SemanticAuthorityGrant) {
  return candidate.allow.every((rule) => container.allow.some((allowed) => ruleIncludes(allowed, rule)))
    && container.deny.every((rule) => candidate.deny.some((denied) => patternContains(denied.action, rule.action)))
    && everyPatternContained(candidate.permittedRoots, container.permittedRoots)
    && everyValueContained(candidate.permittedSideEffects, container.permittedSideEffects)
    && maxIncludes(container.maxTransactionUsd, candidate.maxTransactionUsd);
}

export function classifyAuthorityChange(
  previous: SemanticAuthorityGrant,
  proposed: SemanticAuthorityGrant,
): AuthorityChangeProposal["classification"] {
  const proposedFitsPrevious = authorityIncludes(previous, proposed);
  const previousFitsProposed = authorityIncludes(proposed, previous);
  if (proposedFitsPrevious && previousFitsProposed) return "equivalent";
  if (proposedFitsPrevious) return "narrowing";
  if (previousFitsProposed) return "expansion";
  return "mixed";
}
