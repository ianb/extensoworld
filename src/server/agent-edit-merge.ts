import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WorldEditRecord } from "./storage.js";

/**
 * Apply an entity update overlay to a current record, returning the merged
 * record. The overlay rules:
 *
 * - Top-level fields in `payload` overwrite the current value (full replace).
 * - `payload.properties` is merged into `current.properties`: each key's
 *   value either replaces the existing property or, if `null`, removes it.
 * - Keys absent from `payload` leave the current value untouched.
 *
 * `current` may be `null` to support the case where an earlier edit in the
 * same session created the entity and a later edit updates it before commit.
 * In that case the merge starts from an empty record and the caller must
 * ensure the result is a valid full EntityData.
 */
export function mergeEntityPayload(
  current: EntityData | null,
  payload: Partial<EntityData>,
): EntityData {
  const base: Partial<EntityData> = current ? { ...current } : {};
  // Carry forward existing properties so we can mutate them
  if (current && current.properties) {
    base.properties = { ...current.properties };
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === "properties") continue;
    (base as Record<string, unknown>)[key] = value;
  }
  if (payload.properties) {
    const merged: Record<string, unknown> = base.properties ? { ...base.properties } : {};
    for (const [key, value] of Object.entries(payload.properties)) {
      if (value === null) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    base.properties = Object.keys(merged).length > 0 ? merged : undefined;
  }
  return base as EntityData;
}

/**
 * Apply a handler update overlay to a current record. All top-level fields
 * are full-replace; there is no nested merge.
 */
export function mergeHandlerPayload(
  current: HandlerData | null,
  payload: Partial<HandlerData>,
): HandlerData {
  const base: Partial<HandlerData> = current ? { ...current } : {};
  for (const [key, value] of Object.entries(payload)) {
    (base as Record<string, unknown>)[key] = value;
  }
  return base as HandlerData;
}

/**
 * The result of playing a session's edits forward over a starting state. For
 * each touched target, gives the prior state captured at the moment of the
 * edit (used for revert), and the final state after all edits in the session.
 *
 * `finalState` is null when the target ends the session deleted or never
 * existed (caller must DELETE the materialized row in that case).
 */
export interface ResolvedEdit {
  edit: WorldEditRecord;
  /** The state immediately before this specific edit was applied. */
  priorState: EntityData | HandlerData | null;
}

export interface PlayedSessionEdits {
  resolved: ResolvedEdit[];
  finalEntityState: Map<string, EntityData | null>;
  finalHandlerState: Map<string, HandlerData | null>;
}

/**
 * Walk a session's edits in seq order, computing the prior_state of each
 * edit and the final post-session state of every touched target. Used by
 * commitSession to fan out to the materialized tables.
 *
 * The starting states for each target id are read from the live materialized
 * tables before this function is called and passed in via the maps. After
 * playback, the final maps reflect what should be written back: a present
 * value means INSERT/REPLACE, an explicit null means DELETE.
 */
export function playSessionEdits(
  edits: WorldEditRecord[],
  {
    startEntities,
    startHandlers,
  }: {
    startEntities: Map<string, EntityData | null>;
    startHandlers: Map<string, HandlerData | null>;
  },
): PlayedSessionEdits {
  const finalEntityState = new Map(startEntities);
  const finalHandlerState = new Map(startHandlers);
  const resolved: ResolvedEdit[] = [];

  for (const edit of edits) {
    if (edit.targetKind === "entity") {
      const prior = finalEntityState.has(edit.targetId)
        ? (finalEntityState.get(edit.targetId) as EntityData | null)
        : null;
      let next: EntityData | null;
      if (edit.op === "create") {
        next = edit.payload as EntityData;
      } else if (edit.op === "update") {
        next = mergeEntityPayload(prior, edit.payload as Partial<EntityData>);
      } else {
        next = null;
      }
      resolved.push({ edit, priorState: prior });
      finalEntityState.set(edit.targetId, next);
    } else {
      const prior = finalHandlerState.has(edit.targetId)
        ? (finalHandlerState.get(edit.targetId) as HandlerData | null)
        : null;
      let next: HandlerData | null;
      if (edit.op === "create") {
        next = edit.payload as HandlerData;
      } else if (edit.op === "update") {
        next = mergeHandlerPayload(prior, edit.payload as Partial<HandlerData>);
      } else {
        next = null;
      }
      resolved.push({ edit, priorState: prior });
      finalHandlerState.set(edit.targetId, next);
    }
  }

  return { resolved, finalEntityState, finalHandlerState };
}
