import type { EntityStore, Entity } from "./entity.js";

function entityName(entity: Entity): string {
  return (entity.properties["name"] as string) || entity.id;
}

export function describeRoomFull(
  store: EntityStore,
  { room, playerId }: { room: Entity; playerId: string },
): string {
  const name = entityName(room);
  const description = (room.properties["description"] as string) || "";
  const contents = store.getContents(room.id);

  const exits = contents.filter((e) => e.tags.has("exit"));
  const exitDirs = exits.map((e) => (e.properties["direction"] as string) || "?");
  const exitList = exitDirs.length > 0 ? exitDirs.join(", ") : "none";

  const items = contents.filter((e) => !e.tags.has("exit") && e.id !== playerId);
  const parts = [`${name}\n\n${description}`];

  if (items.length > 0) {
    const itemDescs = items.map((e) => {
      const n = entityName(e);
      if (e.tags.has("container") && e.tags.has("openable")) {
        return e.properties["open"] === true ? `${n} (open)` : `${n} (closed)`;
      }
      return n;
    });
    parts.push(`\nYou see: ${itemDescs.join(", ")}.`);
  }

  parts.push(`\nExits: ${exitList}`);
  return parts.join("");
}
