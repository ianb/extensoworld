import type { EntityStore } from "../core/entity.js";
import type { VerbRegistry } from "../core/verbs.js";
import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WorldEditRecord } from "./storage.js";
import { applyAiEntityRecords } from "./apply-ai-records.js";
import { recordToHandler } from "./handler-convert.js";

/**
 * Apply a session's pending world edits on top of an already-initialized
 * game store and verb registry. The edits replay in seq order:
 *
 *  - Entity create payloads are full EntityData and flow through the existing
 *    overlay loader (applyAiEntityRecords).
 *  - Entity update payloads are partial EntityData and are applied field by
 *    field — only keys present in the payload mutate the entity, with
 *    `properties` entries of `null` erasing the property.
 *  - Entity deletes call store.delete().
 *  - Handler creates/updates register the verb handler (replacing any
 *    existing handler with the same name).
 *  - Handler deletes unregister it.
 */
export function applyPendingEditsToWorld(
  edits: WorldEditRecord[],
  { store, verbs, gameId }: { store: EntityStore; verbs: VerbRegistry; gameId: string },
): void {
  for (const edit of edits) {
    if (edit.targetKind === "entity") {
      applyEntityEdit(edit, { store, gameId });
    } else {
      applyHandlerEdit(edit, { verbs, gameId });
    }
  }
}

const STRUCTURED_ENTITY_FIELDS: ReadonlyArray<keyof EntityData> = [
  "tags",
  "name",
  "description",
  "aliases",
  "secret",
  "scenery",
  "exit",
  "room",
  "ai",
];

function applyEntityEdit(
  edit: WorldEditRecord,
  { store, gameId }: { store: EntityStore; gameId: string },
): void {
  if (edit.op === "delete") {
    if (store.has(edit.targetId)) store.delete(edit.targetId);
    return;
  }
  if (edit.op === "create") {
    const data = edit.payload as EntityData;
    applyAiEntityRecords(
      [
        {
          ...data,
          id: edit.targetId,
          createdAt: edit.createdAt,
          gameId,
          authoring: {
            createdBy: "agent",
            creationSource: "agent",
            creationCommand: edit.sessionId,
          },
        },
      ],
      store,
    );
    return;
  }
  // update — partial overlay; only apply fields actually present in the payload.
  if (!store.has(edit.targetId)) return;
  const patch = edit.payload as Partial<EntityData>;
  const entity = store.get(edit.targetId);
  for (const key of STRUCTURED_ENTITY_FIELDS) {
    if (patch[key] === undefined) continue;
    if (key === "room") {
      entity.room = { ...entity.room, ...patch.room } as typeof entity.room;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entity as any)[key] = patch[key];
    }
  }
  if (patch.location !== undefined) {
    store.setLocation(edit.targetId, patch.location);
  }
  if (patch.properties) {
    for (const [name, value] of Object.entries(patch.properties)) {
      if (value === null) {
        store.removeProperty(edit.targetId, name);
      } else {
        store.setProperty(edit.targetId, { name, value });
      }
    }
  }
}

function applyHandlerEdit(
  edit: WorldEditRecord,
  { verbs, gameId }: { verbs: VerbRegistry; gameId: string },
): void {
  if (edit.op === "delete") {
    verbs.removeByName(edit.targetId);
    return;
  }
  const data = edit.payload as HandlerData;
  const handler = recordToHandler({
    ...data,
    name: edit.targetId,
    createdAt: edit.createdAt,
    gameId,
    authoring: {
      createdBy: "agent",
      creationSource: "agent",
      creationCommand: edit.sessionId,
    },
  });
  verbs.removeByName(edit.targetId);
  verbs.register(handler);
}
