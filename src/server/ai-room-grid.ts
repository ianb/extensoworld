import type { EntityStore, Entity } from "../core/entity.js";
import { reverseDirection } from "./ai-prompt-helpers.js";
import { getStorage } from "./storage-instance.js";
import type { AuthoringInfo } from "./storage.js";

export function uniqueId(store: EntityStore, baseId: string): string {
  if (!store.has(baseId)) return baseId;
  let n = 2;
  while (store.has(`${baseId}-${n}`)) n += 1;
  return `${baseId}-${n}`;
}

export async function createAndSave(
  store: EntityStore,
  opts: {
    id: string;
    tags: string[];
    properties: Record<string, unknown>;
    gameId: string;
    authoring?: AuthoringInfo;
  },
): Promise<void> {
  store.create(opts.id, { tags: opts.tags, properties: opts.properties });
  await getStorage().saveAiEntity({ createdAt: new Date().toISOString(), ...opts });
}

/** Ensure a room has grid coordinates; bootstraps to (0,0,0) if missing. */
export async function ensureGridCoords(
  store: EntityStore,
  { room, gameId, authoring }: { room: Entity; gameId: string; authoring?: AuthoringInfo },
): Promise<void> {
  if (room.properties["gridX"] || room.properties["gridY"]) return;
  store.setProperty(room.id, { name: "gridX", value: 0 });
  store.setProperty(room.id, { name: "gridY", value: 0 });
  store.setProperty(room.id, { name: "gridZ", value: 0 });
  await getStorage().saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: room.id,
    tags: Array.from(room.tags),
    properties: { ...room.properties },
    authoring,
  });
}

/** Create a back-passage on the target room, or resolve an existing unresolved exit. */
export async function resolveOrCreateBackExit(
  store: EntityStore,
  {
    targetRoomId,
    newRoomId,
    direction,
    gameId,
    authoring,
  }: {
    targetRoomId: string;
    newRoomId: string;
    direction: string;
    gameId: string;
    authoring?: AuthoringInfo;
  },
): Promise<void> {
  const backDir = reverseDirection(direction);
  const targetExits = store.getContents(targetRoomId).filter((e) => e.tags.has("exit"));
  const existing = targetExits.find((e) => {
    const d = (e.properties["direction"] as string) || "";
    return d.toLowerCase() === backDir && e.properties["destinationIntent"];
  });
  if (existing) {
    store.setProperty(existing.id, { name: "destination", value: newRoomId });
    store.setProperty(existing.id, { name: "destinationIntent", value: undefined });
    await getStorage().saveAiEntity({
      createdAt: new Date().toISOString(),
      gameId,
      id: existing.id,
      tags: Array.from(existing.tags),
      properties: { ...existing.properties },
      authoring,
    });
  } else {
    const targetSlug = targetRoomId.replace("room:", "");
    const newRoom = store.get(newRoomId);
    const newRoomName = (newRoom.properties["name"] as string) || newRoomId;
    await createAndSave(store, {
      id: `exit:${targetSlug}:${backDir}`,
      tags: ["exit"],
      properties: {
        location: targetRoomId,
        direction: backDir,
        destination: newRoomId,
        name: `Exit ${backDir}`,
        description: `Leads to ${newRoomName}.`,
      },
      gameId,
      authoring,
    });
  }
}
