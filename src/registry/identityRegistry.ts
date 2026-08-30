import {
  agentCapabilityClaimSchema,
  agentPassportSchema,
  assignmentGrantSchema,
  authorityChangeProposalSchema,
  contractVersion,
  observedAgentSchema,
  organizationIdentitySchema,
  principalIdentitySchema,
  semanticAuthorityGrantSchema,
  toolPassportCredentialSchema,
  toolSemanticContractSchema,
  type AgentCapabilityClaim,
  type AgentPassport,
  type AssignmentGrant,
  type AuthorityChangeProposal,
  type ObservedAgent,
  type OrganizationIdentity,
  type PrincipalIdentity,
  type SemanticAuthorityGrant,
  type ToolPassportCredential,
  type ToolSemanticContract,
} from "../domain/contracts";
import { createAssignmentGrant, type AssignmentRequest } from "./assignmentPolicy";
import { classifyAuthorityChange } from "./authorityChanges";

const stateOrder: ObservedAgent["state"][] = ["observed", "correlated", "verified", "governed"];

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(immutable);
  }
  return value;
}

function requireActiveCurrent(record: { status: string; issuedAt: string; expiresAt: string }, now: string, reason: string) {
  if (record.status !== "active" || new Date(record.issuedAt) > new Date(now) || new Date(record.expiresAt) <= new Date(now)) {
    throw new Error(reason);
  }
}

export type ResolvedAssignment = {
  agentPassport: AgentPassport;
  capabilityClaim: AgentCapabilityClaim;
  authorityGrant: SemanticAuthorityGrant;
  credential: ToolPassportCredential;
  toolContract: ToolSemanticContract;
  assignment: AssignmentGrant;
};

export class IdentityRegistry {
  #organizations = new Map<string, OrganizationIdentity>();
  #principals = new Map<string, PrincipalIdentity>();
  #observedAgents = new Map<string, ObservedAgent>();
  #agentPassports = new Map<string, AgentPassport>();
  #capabilityClaims = new Map<string, AgentCapabilityClaim>();
  #authorityGrants = new Map<string, SemanticAuthorityGrant>();
  #authorityChanges = new Map<string, AuthorityChangeProposal>();
  #pendingAuthorityGrantIds = new Set<string>();
  #supersededAuthorityGrantIds = new Set<string>();
  #credentials = new Map<string, ToolPassportCredential>();
  #toolContracts = new Map<string, ToolSemanticContract>();
  #assignments = new Map<string, AssignmentGrant>();
  #frozenAgentIds = new Set<string>();
  #revokedToolPassportIds = new Set<string>();

  registerOrganization(input: OrganizationIdentity) {
    const record = immutable(organizationIdentitySchema.parse(input));
    this.#organizations.set(record.id, record);
    return record;
  }

  registerPrincipal(input: PrincipalIdentity) {
    const record = immutable(principalIdentitySchema.parse(input));
    if (!this.#organizations.has(record.organizationId)) throw new Error("Principal organization is not registered.");
    this.#principals.set(record.id, record);
    return record;
  }

  registerObservedAgent(input: ObservedAgent) {
    const record = immutable(observedAgentSchema.parse(input));
    if (record.organizationId && !this.#organizations.has(record.organizationId)) {
      throw new Error("Observed Agent organization is not registered.");
    }
    this.#observedAgents.set(record.id, record);
    return record;
  }

  registerAgentPassport(input: AgentPassport) {
    const record = immutable(agentPassportSchema.parse(input));
    if (!this.#organizations.has(record.organizationId)) throw new Error("Agent organization is not registered.");
    if (!this.#principals.has(record.principalId)) throw new Error("Agent principal is not registered.");
    this.#agentPassports.set(record.id, record);
    return record;
  }

  registerCapabilityClaim(input: AgentCapabilityClaim) {
    const record = immutable(agentCapabilityClaimSchema.parse(input));
    if (!this.#agentPassports.has(record.agentPassportId)) throw new Error("Capability claim Agent Passport is not registered.");
    this.#capabilityClaims.set(record.id, record);
    return record;
  }

  registerAuthorityGrant(input: SemanticAuthorityGrant) {
    const record = immutable(semanticAuthorityGrantSchema.parse(input));
    const passport = this.#agentPassports.get(record.agentPassportId);
    if (!passport) throw new Error("Authority grant Agent Passport is not registered.");
    if (passport.principalId !== record.issuerPrincipalId) throw new Error("Only the bound principal can issue this authority grant.");
    if (this.#authorityGrants.has(record.id)) throw new Error("Semantic Authority Grant ID is already registered.");
    if (record.version !== 1) throw new Error("Initial Semantic Authority Grant must be version 1.");
    if ([...this.#authorityGrants.values()].some((grant) => grant.agentPassportId === record.agentPassportId)) {
      throw new Error("Agent Passport already has a Semantic Authority Grant lineage.");
    }
    this.#authorityGrants.set(record.id, record);
    return record;
  }

  proposeAuthorityChange(input: {
    previousAuthorityGrantId: string;
    proposedAuthorityGrant: SemanticAuthorityGrant;
    requestedById: string;
    reason: string;
    requestedAt?: string;
  }) {
    const previous = this.#authorityGrants.get(input.previousAuthorityGrantId);
    if (!previous) throw new Error("Previous Semantic Authority Grant is not registered.");
    if (this.#pendingAuthorityGrantIds.has(previous.id)) throw new Error("Cannot revise a pending Semantic Authority Grant.");
    if (this.#supersededAuthorityGrantIds.has(previous.id)) throw new Error("Cannot revise a superseded Semantic Authority Grant.");
    if ([...this.#authorityChanges.values()].some((change) => (
      change.agentPassportId === previous.agentPassportId && change.status === "pending"
    ))) throw new Error("A pending authority change already exists for this agent.");

    const proposed = immutable(semanticAuthorityGrantSchema.parse(input.proposedAuthorityGrant));
    if (this.#authorityGrants.has(proposed.id)) throw new Error("Proposed Semantic Authority Grant ID is already registered.");
    if (proposed.agentPassportId !== previous.agentPassportId || proposed.issuerPrincipalId !== previous.issuerPrincipalId) {
      throw new Error("Authority revisions cannot change the bound agent or issuing principal.");
    }
    if (proposed.version !== previous.version + 1) throw new Error("Authority revisions must advance exactly one version.");

    const requestedAt = input.requestedAt ?? new Date().toISOString();
    const change = immutable(authorityChangeProposalSchema.parse({
      contractVersion,
      id: `authority-change:${proposed.id}`,
      agentPassportId: proposed.agentPassportId,
      previousAuthorityGrantId: previous.id,
      proposedAuthorityGrantId: proposed.id,
      classification: classifyAuthorityChange(previous, proposed),
      status: "pending",
      requestedById: input.requestedById,
      reason: input.reason,
      requestedAt,
    }));
    this.#authorityGrants.set(proposed.id, proposed);
    this.#pendingAuthorityGrantIds.add(proposed.id);
    this.#authorityChanges.set(change.id, change);
    return change;
  }

  approveAuthorityChange(id: string, decidedById: string, decidedAt = new Date().toISOString()) {
    const current = this.#authorityChanges.get(id);
    if (!current || current.status !== "pending") throw new Error("Authority change is not pending.");
    if (!this.#pendingAuthorityGrantIds.has(current.proposedAuthorityGrantId)) throw new Error("Proposed Semantic Authority Grant is not pending approval.");
    if (this.#pendingAuthorityGrantIds.has(current.previousAuthorityGrantId)
      || this.#supersededAuthorityGrantIds.has(current.previousAuthorityGrantId)) {
      throw new Error("Previous Semantic Authority Grant is not the approved lineage head.");
    }
    const next = immutable(authorityChangeProposalSchema.parse({
      ...current,
      status: "approved",
      decidedById,
      decidedAt,
    }));
    this.#pendingAuthorityGrantIds.delete(current.proposedAuthorityGrantId);
    this.#supersededAuthorityGrantIds.add(current.previousAuthorityGrantId);
    this.#authorityChanges.set(id, next);
    return next;
  }

  rejectAuthorityChange(id: string, decidedById: string, decidedAt = new Date().toISOString()) {
    const current = this.#authorityChanges.get(id);
    if (!current || current.status !== "pending") throw new Error("Authority change is not pending.");
    const next = immutable(authorityChangeProposalSchema.parse({
      ...current,
      status: "rejected",
      decidedById,
      decidedAt,
    }));
    this.#pendingAuthorityGrantIds.delete(current.proposedAuthorityGrantId);
    this.#supersededAuthorityGrantIds.add(current.proposedAuthorityGrantId);
    this.#authorityChanges.set(id, next);
    return next;
  }

  authorityGrant(id: string) {
    return semanticAuthorityGrantSchema.parse(this.#authorityGrants.get(id));
  }

  registerToolCredential(
    input: ToolPassportCredential,
    admission: { integrityValid: boolean; current: boolean; flintVerified: boolean },
  ) {
    const record = immutable(toolPassportCredentialSchema.parse(input));
    if (!admission.integrityValid || !admission.current) throw new Error("Tool Passport credential failed integrity or currency verification.");
    if (record.passport.assuranceLevel === "flint-verified" && !admission.flintVerified) {
      throw new Error("FLINT-verified Tool Passport requires a trusted FLINT verification result.");
    }
    this.#credentials.set(record.passport.id, record);
    return record;
  }

  registerToolContract(input: ToolSemanticContract) {
    const record = immutable(toolSemanticContractSchema.parse(input));
    const credential = this.#credentials.get(record.toolPassportId);
    if (!credential) throw new Error("Tool Semantic Contract passport is not registered.");
    if (credential.passport.artifactDigest !== record.artifactDigest) throw new Error("Tool Semantic Contract version does not match its Tool Passport.");
    this.#toolContracts.set(record.id, record);
    return record;
  }

  transitionObservedAgent(id: string, nextState: ObservedAgent["state"], linkedAgentPassportId?: string) {
    const current = this.#observedAgents.get(id);
    if (!current) throw new Error("Observed Agent is not registered.");
    if (stateOrder.indexOf(nextState) !== stateOrder.indexOf(current.state) + 1) {
      throw new Error("Observed Agent identity states must advance one evidence-backed step at a time.");
    }
    const passportId = linkedAgentPassportId ?? current.linkedAgentPassportId;
    if (["verified", "governed"].includes(nextState) && (!passportId || !this.#agentPassports.has(passportId))) {
      throw new Error("Verified and governed states require a registered Agent Passport.");
    }
    if (nextState === "governed" && ![...this.#assignments.values()].some((assignment) => (
      assignment.agentPassportId === passportId
      && assignment.status === "active"
      && (() => {
        try {
          this.resolveAssignment(assignment.id);
          return true;
        } catch {
          return false;
        }
      })()
    ))) {
      throw new Error("Governed state requires an active assignment.");
    }

    const next = immutable(observedAgentSchema.parse({ ...current, state: nextState, linkedAgentPassportId: passportId }));
    this.#observedAgents.set(id, next);
    return next;
  }

  async createAssignment(input: {
    agentPassportId: string;
    capabilityClaimId: string;
    authorityGrantId: string;
    toolPassportId: string;
    toolContractId: string;
    request: AssignmentRequest;
    now?: string;
  }) {
    const agentPassport = this.#agentPassports.get(input.agentPassportId);
    const capabilityClaim = this.#capabilityClaims.get(input.capabilityClaimId);
    const authorityGrant = this.#authorityGrants.get(input.authorityGrantId);
    const credential = this.#credentials.get(input.toolPassportId);
    const toolContract = this.#toolContracts.get(input.toolContractId);
    if (!agentPassport || !capabilityClaim || !authorityGrant || !credential || !toolContract) {
      throw new Error("Assignment dependencies are incomplete.");
    }
    if (this.#pendingAuthorityGrantIds.has(authorityGrant.id)) throw new Error("Semantic Authority Grant is pending approval.");
    if (this.#supersededAuthorityGrantIds.has(authorityGrant.id)) throw new Error("Semantic Authority Grant is superseded.");
    if (this.#frozenAgentIds.has(agentPassport.id)) throw new Error("Agent Passport is frozen.");
    if (this.#revokedToolPassportIds.has(credential.passport.id)) throw new Error("Tool Passport is revoked.");
    const organization = this.#organizations.get(agentPassport.organizationId);
    const principal = this.#principals.get(agentPassport.principalId);
    if (!organization || organization.status !== "active") throw new Error("Agent organization is not active.");
    if (!principal || principal.status !== "active") throw new Error("Agent principal is not active.");

    const assignment = immutable(await createAssignmentGrant({
      agentPassport,
      capabilityClaim,
      authorityGrant,
      toolPassport: credential.passport,
      toolContract,
      request: input.request,
      now: input.now,
    }));
    this.#assignments.set(assignment.id, assignment);
    return assignment;
  }

  freezeAgent(agentPassportId: string) {
    if (!this.#agentPassports.has(agentPassportId)) throw new Error("Agent Passport is not registered.");
    this.#frozenAgentIds.add(agentPassportId);
  }

  revokeToolPassport(toolPassportId: string) {
    if (!this.#credentials.has(toolPassportId)) throw new Error("Tool Passport is not registered.");
    this.#revokedToolPassportIds.add(toolPassportId);
  }

  resolveAssignment(assignmentId: string, options: { now?: string } = {}): ResolvedAssignment {
    const assignment = assignmentGrantSchema.parse(this.#assignments.get(assignmentId));
    const agentPassport = agentPassportSchema.parse(this.#agentPassports.get(assignment.agentPassportId));
    const capabilityClaim = agentCapabilityClaimSchema.parse(this.#capabilityClaims.get(assignment.capabilityClaimId));
    const authorityGrant = semanticAuthorityGrantSchema.parse(this.#authorityGrants.get(assignment.semanticAuthorityGrantId));
    const credential = toolPassportCredentialSchema.parse(this.#credentials.get(assignment.toolPassportId));
    const toolContract = toolSemanticContractSchema.parse(this.#toolContracts.get(assignment.toolSemanticContractId));
    const now = options.now ?? new Date().toISOString();
    const organization = organizationIdentitySchema.parse(this.#organizations.get(agentPassport.organizationId));
    const principal = principalIdentitySchema.parse(this.#principals.get(agentPassport.principalId));

    if (this.#pendingAuthorityGrantIds.has(authorityGrant.id)) throw new Error("Semantic Authority Grant is pending approval.");
    if (this.#supersededAuthorityGrantIds.has(authorityGrant.id)) throw new Error("Semantic Authority Grant is superseded.");
    if (this.#frozenAgentIds.has(agentPassport.id)) throw new Error("Agent Passport is frozen.");
    if (this.#revokedToolPassportIds.has(credential.passport.id)) throw new Error("Tool Passport is revoked.");
    if (organization.status !== "active") throw new Error("Agent organization is not active.");
    if (principal.status !== "active") throw new Error("Agent principal is not active.");
    requireActiveCurrent(agentPassport, now, "Agent Passport is not active and current.");
    requireActiveCurrent(capabilityClaim, now, "Capability Claim is not active and current.");
    requireActiveCurrent(authorityGrant, now, "Semantic Authority Grant is not active and current.");
    requireActiveCurrent(credential.passport, now, "Tool Passport is not active and current.");
    requireActiveCurrent(toolContract, now, "Tool Semantic Contract is not active and current.");
    requireActiveCurrent(assignment, now, "Assignment Grant is not active and current.");
    if (toolContract.artifactDigest !== credential.passport.artifactDigest) throw new Error("Tool Semantic Contract version mismatch.");

    return { agentPassport, capabilityClaim, authorityGrant, credential, toolContract, assignment };
  }

  snapshot() {
    return {
      organizations: [...this.#organizations.values()],
      principals: [...this.#principals.values()],
      observedAgents: [...this.#observedAgents.values()],
      agentPassports: [...this.#agentPassports.values()],
      capabilityClaims: [...this.#capabilityClaims.values()],
      authorityGrants: [...this.#authorityGrants.values()],
      authorityChanges: [...this.#authorityChanges.values()],
      credentials: [...this.#credentials.values()],
      toolContracts: [...this.#toolContracts.values()],
      assignments: [...this.#assignments.values()],
      frozenAgentIds: [...this.#frozenAgentIds],
      revokedToolPassportIds: [...this.#revokedToolPassportIds],
    };
  }
}
