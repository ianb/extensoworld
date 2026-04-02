import type { EntityStore, Entity } from "./entity.js";
import { renderTemplate } from "./templates.js";

/** Mark an entity name for highlighting in output: {{id|Name}} */
export function entityRef(entity: Entity): string {
  return `{{${entity.id}|${entity.name}}}`;
}

/**
 * Display string for an item in listings (inventory, room "You see:").
 * Uses shortDescription template if set, otherwise falls back to entityRef.
 */
export function itemDisplay(entity: Entity, store: EntityStore): string {
  const short = entity.properties.shortDescription;
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
  const description = renderTemplate(room.description, { entity: room, store });
  const contents = store.getContents(room.id);

  const exits = contents.filter((e) => e.tags.includes("exit"));
  const exitDescs = exits.map((e) => {
    const dir = (e.exit && e.exit.direction) || "?";
    const short = e.properties.shortDescription;
    if (short) {
      const rendered = renderTemplate(short, { entity: e, store });
      return `<<${dir}>> (${rendered})`;
    }
    if (e.name && e.name !== e.id) {
      return `<<${dir}>> (${e.name})`;
    }
    return `<<${dir}>>`;
  });
  const exitList = exitDescs.length > 0 ? exitDescs.join(", ") : "none";

  const nonExits = contents.filter((e) => !e.tags.includes("exit") && e.id !== playerId);
  const npcs = nonExits.filter((e) => e.tags.includes("npc"));
  const items = nonExits.filter((e) => !e.tags.includes("npc"));
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
      if (e.tags.includes("container") && e.tags.includes("openable")) {
        return e.properties.open ? `${display} (open)` : `${display} (closed)`;
      }
      return display;
    });
    parts.push(`\nYou see: ${itemDescs.join(", ")}.`);
  }

  parts.push(`\nExits: ${exitList}`);
  return parts.join("");
}
