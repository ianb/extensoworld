import type { EntityStore } from "../core/entity.js";
import type { VerbRegistry } from "../core/verbs.js";
import { getStorage } from "./storage-instance.js";

interface CommandResponse {
  output: string;
}

export async function handleAiDestroyCommand(
  store: EntityStore,
  { objectName, gameId }: { objectName: string; gameId: string },
): Promise<CommandResponse> {
  const storage = getStorage();
  const aiIds = await storage.getAiEntityIds(gameId);
  let match: string | null = null;
  for (const id of aiIds) {
    if (!store.has(id)) continue;
    const entity = store.get(id);
    const name = (entity.name || "").toLowerCase();
    const aliases = entity.aliases;
    if (
      name === objectName ||
      id === objectName ||
      aliases.some((a) => a.toLowerCase() === objectName)
    ) {
      match = id;
      break;
    }
  }
  if (!match) {
    const handlerRecords = await storage.listHandlers(gameId);
    const verbMatches = handlerRecords.filter((r) => r.name.toLowerCase().includes(objectName));
    const hint = verbMatches.length > 0 ? `\nDid you mean: ai destroy verb ${objectName}` : "";
    return { output: `No AI-created object matching "${objectName}" found.${hint}` };
  }
  const entity = store.get(match);
  const entityName = entity.name || match;
  const destroyed: string[] = [match];

  // If destroying a room, also clean up related exits
  if (entity.tags.includes("room")) {
    // Remove exits inside this room
    const contents = store.getContents(match);
    for (const child of contents) {
      if (child.tags.includes("exit")) {
        destroyed.push(child.id);
      }
    }
    // Revert exits in other rooms that point to this room back to unresolved
    const allExits = store.findByTag("exit");
    for (const exit of allExits) {
      if (exit.exit && exit.exit.destination === match) {
        const intent = exit.exit.destinationIntent || entityName;
        exit.exit.destination = undefined;
        exit.exit.destinationIntent = intent;
      }
    }
  }

  for (const id of destroyed) {
    if (store.has(id)) store.delete(id);
    await storage.removeAiEntity(gameId, id);
  }

  const extra = destroyed.length > 1 ? ` and ${destroyed.length - 1} related exit(s)` : "";
  return { output: `[Destroyed ${entityName} (${match})${extra}]` };
}

export async function handleAiDestroyVerbCommand({
  search,
  confirm,
  gameId,
  verbs,
}: {
  search: string;
  confirm: boolean;
  gameId: string;
  verbs: VerbRegistry;
}): Promise<CommandResponse> {
  const storage = getStorage();
  const records = await storage.listHandlers(gameId);
  const lower = search.toLowerCase();
  const matches = records.filter((r) => r.name.toLowerCase().includes(lower));

  if (matches.length === 0) {
    return { output: `No AI verb handlers matching "${search}" found.` };
  }

  if (!confirm) {
    const lines = matches.map((r) => {
      const verb = r.pattern.verb;
      const form = r.pattern.form;
      const target = r.entityId || r.tag || "";
      const confirmCmd = `ai destroy verb confirm ${r.name}`;
      const header = `${r.name}  (${verb} ${form}${target ? " " + target : ""}) ((${confirmCmd}|delete))`;
      const code = r.perform.length > 200 ? r.perform.slice(0, 200) + "..." : r.perform;
      return `  ${header}\n    ${code}`;
    });
    return {
      output: `Found ${matches.length} AI verb handler(s):\n${lines.join("\n")}`,
    };
  }

  // Confirm mode — exact match required
  const exact = records.find((r) => r.name === search);
  if (!exact) {
    return { output: `No AI verb handler with exact name "${search}" found.` };
  }

  await storage.removeHandler(gameId, exact.name);
  verbs.removeByName(exact.name);
  return { output: `[Destroyed verb handler: ${exact.name}]` };
}
