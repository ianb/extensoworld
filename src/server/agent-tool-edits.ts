import type { EntityData, HandlerData } from "../core/game-data.js";
import type {
  NewWorldEditRecord,
  WorldEditOp,
  WorldEditRecord,
  WorldEditTargetKind,
} from "./storage.js";
import type { ToolContext } from "./agent-tool-context.js";
import { applyPendingEditsToWorld } from "./agent-world-view.js";
import type { EditBatchInput, EditInput } from "./agent-tool-schemas.js";

/**
 * Result returned to the agent when an apply_edits batch succeeds.
 */
export interface EditBatchResult {
  ok: true;
  applied: number;
  /** A short per-edit description for the agent's working memory. */
  edits: Array<{ kind: WorldEditTargetKind; id: string; op: WorldEditOp }>;
}

/**
 * Result returned to the agent when an apply_edits batch is rejected.
 * No edits were appended to the log; the agent should fix and retry.
 */
export interface EditBatchError {
  ok: false;
  error: string;
  failures: Array<{ index: number; reason: string }>;
}

interface NormalizedEdit {
  kind: WorldEditTargetKind;
  id: string;
  op: WorldEditOp;
  payload: unknown;
}

/**
 * Validate a batch of edits and, if every entry is valid, append them to
 * the world_edits log AND apply them to the in-memory store/verbs so the
 * agent's next read includes them. Reject the whole batch on any failure.
 */
export async function applyEditBatch(
  context: ToolContext,
  input: EditBatchInput,
): Promise<EditBatchResult | EditBatchError> {
  const normalized: NormalizedEdit[] = [];
  const failures: Array<{ index: number; reason: string }> = [];

  for (let i = 0; i < input.edits.length; i++) {
    const item = input.edits[i]!;
    const result = normalizeEdit(item, i);
    if ("error" in result) {
      failures.push({ index: i, reason: result.error });
    } else {
      normalized.push(result);
    }
  }

  if (failures.length === 0) {
    // Second pass: validate against the world view (existence checks).
    for (const [i, edit] of normalized.entries()) {
      const reason = validateEditAgainstWorld(edit, context);
      if (reason) failures.push({ index: i, reason });
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: `Rejected ${failures.length} of ${input.edits.length} edits; nothing was applied.`,
      failures,
    };
  }

  // Try to apply to the in-memory view FIRST, in a snapshot we can restore
  // if any edit's apply throws (e.g. UndefinedPropertyError from store.create).
  // Only if the apply succeeds end-to-end do we append to the persistent log.
  // This keeps the world_edits log and the in-memory store in lockstep — no
  // half-applied batches leaking into storage where future ticks would replay
  // them.
  const trialEdits: WorldEditRecord[] = normalized.map((edit, i) => ({
    seq: -1 - i, // dummy seq for the trial run
    gameId: context.gameId,
    sessionId: context.sessionId,
    targetKind: edit.kind,
    targetId: edit.id,
    op: edit.op,
    payload: edit.payload,
    priorState: null,
    applied: false,
    createdAt: new Date().toISOString(),
  }));

  const snapshot = context.store.saveState();
  try {
    applyPendingEditsToWorld(trialEdits, {
      store: context.store,
      verbs: context.verbs,
      gameId: context.gameId,
    });
  } catch (e: unknown) {
    context.store.restoreState(snapshot);
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Edit batch failed during apply: ${reason}. Nothing was persisted.`,
      failures: [{ index: -1, reason }],
    };
  }

  // Apply succeeded — now append the edits to the persistent log so future
  // ticks (and the eventual commit on finish) see them.
  const appended: WorldEditRecord[] = [];
  for (const edit of normalized) {
    const newRecord: NewWorldEditRecord = {
      gameId: context.gameId,
      sessionId: context.sessionId,
      targetKind: edit.kind,
      targetId: edit.id,
      op: edit.op,
      payload: edit.payload,
      createdAt: new Date().toISOString(),
    };
    const stored = await context.storage.appendWorldEdit(newRecord);
    appended.push(stored);
    context.pendingEdits.push(stored);
  }

  return {
    ok: true,
    applied: appended.length,
    edits: appended.map((e) => ({
      kind: e.targetKind,
      id: e.targetId,
      op: e.op,
    })),
  };
}

function normalizeEdit(item: EditInput, index: number): NormalizedEdit | { error: string } {
  if ("entity" in item) {
    return normalizeEntityEdit(item.entity, index);
  }
  if ("handler" in item) {
    return normalizeHandlerEdit(item.handler, index);
  }
  return { error: `Edit ${index}: missing 'entity' or 'handler' key.` };
}

function normalizeEntityEdit(
  entity: { id: string; create?: unknown; value?: unknown; delete?: boolean },
  index: number,
): NormalizedEdit | { error: string } {
  const isDelete = entity.delete === true;
  const opCount =
    (entity.create !== undefined ? 1 : 0) +
    (entity.value !== undefined ? 1 : 0) +
    (isDelete ? 1 : 0);
  if (opCount === 0) {
    return {
      error: `Edit ${index}: entity must specify exactly one of 'create', 'value', or 'delete: true'.`,
    };
  }
  if (opCount > 1) {
    return {
      error: `Edit ${index}: entity has multiple operations; specify only one of create/value/delete.`,
    };
  }
  if (entity.create !== undefined) {
    return { kind: "entity", id: entity.id, op: "create", payload: entity.create };
  }
  if (entity.value !== undefined) {
    return { kind: "entity", id: entity.id, op: "update", payload: entity.value };
  }
  return { kind: "entity", id: entity.id, op: "delete", payload: null };
}

function normalizeHandlerEdit(
  handler: { name: string; create?: unknown; value?: unknown; delete?: boolean },
  index: number,
): NormalizedEdit | { error: string } {
  const isDelete = handler.delete === true;
  const opCount =
    (handler.create !== undefined ? 1 : 0) +
    (handler.value !== undefined ? 1 : 0) +
    (isDelete ? 1 : 0);
  if (opCount === 0) {
    return {
      error: `Edit ${index}: handler must specify exactly one of 'create', 'value', or 'delete: true'.`,
    };
  }
  if (opCount > 1) {
    return {
      error: `Edit ${index}: handler has multiple operations; specify only one of create/value/delete.`,
    };
  }
  if (handler.create !== undefined) {
    return { kind: "handler", id: handler.name, op: "create", payload: handler.create };
  }
  if (handler.value !== undefined) {
    return { kind: "handler", id: handler.name, op: "update", payload: handler.value };
  }
  return { kind: "handler", id: handler.name, op: "delete", payload: null };
}

function validateEditAgainstWorld(edit: NormalizedEdit, context: ToolContext): string | null {
  if (edit.kind === "entity") {
    const exists = context.store.has(edit.id);
    if (edit.op === "create" && exists) {
      return `Entity ${edit.id} already exists; use 'value' to update or pick a different id.`;
    }
    if ((edit.op === "update" || edit.op === "delete") && !exists) {
      return `Entity ${edit.id} does not exist.`;
    }
    if (edit.op === "create") {
      const data = edit.payload as EntityData;
      if (!context.store.has(data.location)) {
        return `Entity ${edit.id} create payload references unknown location '${data.location}'.`;
      }
    }
    return null;
  }
  // handler
  const existing = findHandlerByName(context, edit.id);
  if (edit.op === "create" && existing) {
    return `Handler ${edit.id} already exists; use 'value' to update or pick a different name.`;
  }
  if ((edit.op === "update" || edit.op === "delete") && !existing) {
    return `Handler ${edit.id} does not exist.`;
  }
  if (edit.op === "create") {
    const data = edit.payload as HandlerData;
    if (!data.perform) {
      return `Handler ${edit.id} create payload must include a 'perform' code body.`;
    }
  }
  return null;
}

function findHandlerByName(context: ToolContext, name: string): boolean {
  // VerbRegistry doesn't expose handler-by-name lookup; reuse removeByName's
  // probe approach by walking the registry's internal handlers via a side
  // channel. We avoid touching internals by checking pendingEdits + asking
  // the registry to dispatch a fake command — neither is ideal. Instead we
  // track handler names locally via the pending edits and treat any handler
  // already present in the live registry as opaque: we cannot detect it
  // without registry access. For v1 this is acceptable since handler edits
  // primarily target ai-* handlers which the agent itself just created.
  for (const edit of context.pendingEdits) {
    if (edit.targetKind !== "handler" || edit.targetId !== name) continue;
    if (edit.op === "delete") return false;
    return true;
  }
  return false;
}
