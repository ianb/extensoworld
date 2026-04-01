import type { EntityStore, Entity } from "./entity.js";
import { renderTemplate } from "./templates.js";

function entityName(entity: Entity): string {
  return (entity.properties["name"] as string) || entity.id;
}

/** Mark an entity name for highlighting in output: {{id|Name}} */
export function entityRef(entity: Entity): string {
  return `{{${entity.id}|${entityName(entity)}}}`;
}

/**
 * Display string for an item in listings (inventory, room "You see:").
 * Uses shortDescription template if set, otherwise falls back to entityRef.
 */
export function itemDisplay(entity: Entity, store: EntityStore): string {
  const short = entity.properties["shortDescription"] as string | undefined;
  if (short) {
    const rendered = renderTemplate(short, { entity, store });
    return `{{${entity.id}|${rendered}}}`;
  }
  return entityRef(entity);
}

export function describeRoomFull(
  store: EntityStore,
  { room, playerId }: { room: Entity; playerId: string },
): string {
  const name = entityRef(room);
  const rawDescription = (room.properties["description"] as string) || "";
  const description = renderTemplate(rawDescription, { entity: room, store });
  const contents = store.getContents(room.id);

  const exits = contents.filter((e) => e.tags.has("exit"));
  const exitDescs = exits.map((e) => {
    const dir = (e.properties["direction"] as string) || "?";
    const short = e.properties["shortDescription"] as string | undefined;
    if (short) {
      const rendered = renderTemplate(short, { entity: e, store });
      return `<<${dir}>> (${rendered})`;
    }
    const exitName = e.properties["name"] as string | undefined;
    if (exitName) {
      return `<<${dir}>> (${exitName})`;
    }
    return `<<${dir}>>`;
  });
  const exitList = exitDescs.length > 0 ? exitDescs.join(", ") : "none";

  const nonExits = contents.filter((e) => !e.tags.has("exit") && e.id !== playerId);
  const npcs = nonExits.filter((e) => e.tags.has("npc"));
  const items = nonExits.filter((e) => !e.tags.has("npc"));
  const parts = [`${name}\n\n${description}`];

  if (npcs.length > 0) {
    const npcDescs = npcs.map((e) => itemDisplay(e, store));
    parts.push(
      `\n${npcs.length === 1 ? `${npcDescs[0]!} is here.` : `${npcDescs.join(", ")} are here.`}`,
    );
  }

  if (items.length > 0) {
    const itemDescs = items.map((e) => {
      const display = itemDisplay(e, store);
      if (e.tags.has("container") && e.tags.has("openable")) {
        return e.properties["open"] === true ? `${display} (open)` : `${display} (closed)`;
      }
      return display;
    });
    parts.push(`\nYou see: ${itemDescs.join(", ")}.`);
  }

  parts.push(`\nExits: ${exitList}`);
  return parts.join("");
}
