import type { EntityStore, Entity } from "./entity.js";
import type { ParsedCommand, ResolvedCommand } from "./verb-types.js";

class AmbiguousObjectError extends Error {
  public readonly objectName: string;
  public readonly matches: Entity[];
  constructor(objectName: string, matches: Entity[]) {
    super(`Ambiguous object: "${objectName}"`);
    this.name = "AmbiguousObjectError";
    this.objectName = objectName;
    this.matches = matches;
  }
}

function findVisibleEntities(
  store: EntityStore,
  { roomId, playerId }: { roomId: string; playerId: string },
): Entity[] {
  const inRoom = store.getContentsDeep(roomId);
  const carried = store.getContentsDeep(playerId);
  return [...inRoom, ...carried];
}

function matchEntityByName(
  name: string,
  candidates: Entity[],
): Entity | AmbiguousObjectError | null {
  const lower = name.toLowerCase();
  const exact: Entity[] = [];
  const partial: Entity[] = [];

  for (const entity of candidates) {
    const entityName = (entity.properties["name"] as string) || "";
    const entityNameLower = entityName.toLowerCase();
    if (entityNameLower === lower) {
      exact.push(entity);
    } else if (entityNameLower.includes(lower)) {
      partial.push(entity);
    }
  }

  if (exact.length === 1) return exact[0] || null;
  if (exact.length > 1) return new AmbiguousObjectError(name, exact);
  if (partial.length === 1) return partial[0] || null;
  if (partial.length > 1) return new AmbiguousObjectError(name, partial);
  return null;
}

function resolveObject(name: string, visible: Entity[]): Entity | string {
  const result = matchEntityByName(name, visible);
  if (result instanceof AmbiguousObjectError) {
    const names = result.matches.map((m) => (m.properties["name"] as string) || m.id);
    return `Which "${name}" do you mean? ${names.join(", ")}`;
  }
  if (!result) return `You don't see "${name}" here.`;
  return result;
}

export function resolveCommand(
  parsed: ParsedCommand,
  { store, roomId, playerId }: { store: EntityStore; roomId: string; playerId: string },
): ResolvedCommand | string {
  if (parsed.form === "intransitive") {
    return { form: "intransitive", verb: parsed.verb };
  }

  const visible = findVisibleEntities(store, { roomId, playerId });

  if (parsed.form === "transitive") {
    const obj = resolveObject(parsed.object, visible);
    if (typeof obj === "string") return obj;
    return { form: "transitive", verb: parsed.verb, object: obj };
  }

  if (parsed.form === "prepositional") {
    const obj = resolveObject(parsed.object, visible);
    if (typeof obj === "string") return obj;
    return { form: "prepositional", verb: parsed.verb, prep: parsed.prep, object: obj };
  }

  // ditransitive
  const obj = resolveObject(parsed.object, visible);
  if (typeof obj === "string") return obj;
  const indirect = resolveObject(parsed.indirect, visible);
  if (typeof indirect === "string") return indirect;
  return {
    form: "ditransitive",
    verb: parsed.verb,
    object: obj,
    prep: parsed.prep,
    indirect: indirect,
  };
}
