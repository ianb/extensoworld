import type { EntityStore, Entity } from "./entity.js";

// --- Parsed command structures ---

export type ParsedCommand =
  | { form: "intransitive"; verb: string }
  | { form: "transitive"; verb: string; object: string }
  | { form: "prepositional"; verb: string; prep: string; object: string }
  | { form: "ditransitive"; verb: string; object: string; prep: string; indirect: string };

// --- Resolved command (objects matched to entities) ---

export type ResolvedCommand =
  | { form: "intransitive"; verb: string }
  | { form: "transitive"; verb: string; object: Entity }
  | { form: "prepositional"; verb: string; prep: string; object: Entity }
  | { form: "ditransitive"; verb: string; object: Entity; prep: string; indirect: Entity };

// --- Handler phases and results ---

export type CheckResult = { applies: true } | { applies: false };

export type VetoResult = { blocked: false } | { blocked: true; output: string };

export interface PerformResult {
  output: string;
  events: WorldEvent[];
}

export interface WorldEvent {
  type: string;
  entityId: string;
  property?: string;
  value?: unknown;
  oldValue?: unknown;
  description: string;
}

// --- Declarative requirements ---

export interface EntityRequirements {
  tags?: string[];
  properties?: Record<string, unknown>;
}

// --- Verb handler ---

export interface VerbPattern {
  verb: string;
  form: ParsedCommand["form"];
  prep?: string;
}

export interface VerbHandler {
  pattern: VerbPattern;
  priority: number;
  entityId?: string;
  tag?: string;
  objectRequirements?: EntityRequirements;
  indirectRequirements?: EntityRequirements;
  check?: (context: VerbContext) => CheckResult;
  veto?: (context: VerbContext) => VetoResult;
  perform: (context: VerbContext) => PerformResult;
}

export interface VerbContext {
  store: EntityStore;
  command: ResolvedCommand;
  player: Entity;
  room: Entity;
}

export type DispatchResult =
  | { outcome: "performed"; output: string; events: WorldEvent[] }
  | { outcome: "vetoed"; output: string }
  | { outcome: "unhandled" };
