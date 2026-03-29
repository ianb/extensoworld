import { z } from "zod";
import type { Entity, EntityStore } from "../core/entity.js";
import type { JSONSchema7 } from "../core/json-schema.js";
import type { PropertyDefinition } from "../core/properties.js";

/** Format a property schema as a concise type string */
function formatSchemaType(schema: JSONSchema7): string {
  // entity-ref is a special case
  if (schema.type === "string" && schema.format === "entity-ref") {
    return "entity-ref";
  }

  // array of a single type
  if (schema.type === "array" && schema.items && typeof schema.items === "object") {
    const itemType = formatSchemaType(schema.items);
    return `${itemType}[]`;
  }

  // simple single type with no extra attributes
  if (typeof schema.type === "string") {
    const hasExtras =
      schema.enum !== undefined ||
      schema.minimum !== undefined ||
      schema.maximum !== undefined ||
      schema.minLength !== undefined ||
      schema.maxLength !== undefined ||
      schema.pattern !== undefined;
    if (!hasExtras) {
      return schema.type;
    }
  }

  // fallback: show the full schema
  return JSON.stringify(schema);
}

function formatPropertyDef(def: PropertyDefinition): string {
  const typeStr = formatSchemaType(def.schema);
  return `- ${def.name} (${typeStr}): ${def.description}`;
}

export function describeProperties(store: EntityStore): string {
  const defs = store.registry.definitions;
  return Object.values(defs).map(formatPropertyDef).join("\n");
}

/** Filter properties to only include those defined in the store's registry, skipping undefined */
export function filterKnownProperties(
  store: EntityStore,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (store.registry.definitions[key]) {
      result[key] = value;
    } else {
      console.warn(`[ai] Skipping unknown property: ${key}`);
    }
  }
  return result;
}

function jsonSchemaToZod(schema: JSONSchema7, description: string): z.ZodTypeAny {
  if (schema.type === "boolean") return z.boolean().optional().describe(description);
  if (schema.type === "number" || schema.type === "integer")
    return z.number().optional().describe(description);
  if (schema.type === "string") {
    if (schema.enum) {
      const values = schema.enum as string[];
      return z
        .enum(values as [string, ...string[]])
        .optional()
        .describe(description);
    }
    return z.string().optional().describe(description);
  }
  if (schema.type === "array") return z.array(z.unknown()).optional().describe(description);
  return z.unknown().optional().describe(description);
}

/**
 * Build a zod schema with explicit optional fields for each property in the registry.
 * Excludes properties that are already handled as top-level fields in the response schema.
 */
export function buildPropertiesSchema(
  store: EntityStore,
  { exclude }: { exclude: string[] },
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const excludeSet = new Set(exclude);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of Object.values(store.registry.definitions)) {
    if (excludeSet.has(def.name)) continue;
    // Skip entity-ref properties — the AI shouldn't set these directly
    if (def.schema.format === "entity-ref") continue;
    shape[def.name] = jsonSchemaToZod(def.schema, def.description);
  }
  return z.object(shape);
}

const REVERSE_DIRECTIONS: Record<string, string> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
  northeast: "southwest",
  southwest: "northeast",
  northwest: "southeast",
  southeast: "northwest",
};

export function reverseDirection(direction: string): string {
  return REVERSE_DIRECTIONS[direction.toLowerCase()] || "back";
}

export function collectTags(store: EntityStore): string[] {
  const tags = new Set<string>();
  const propertyNames = new Set(Object.keys(store.registry.definitions));
  for (const id of store.getAllIds()) {
    const entity = store.get(id);
    for (const tag of entity.tags) {
      if (!propertyNames.has(tag)) {
        tags.add(tag);
      }
    }
  }
  return Array.from(tags).toSorted();
}

// --- Nearby entity context for AI prompts ---

const SKIP_TAGS = new Set(["exit", "player", "region"]);
const HIDDEN_PROPS = new Set(["location", "aliases", "aiPrompt", "scenery", "shortDescription"]);

function isInteresting(entity: Entity): boolean {
  for (const tag of entity.tags) {
    if (SKIP_TAGS.has(tag)) return false;
  }
  return true;
}

function describeEntityDetail(entity: Entity): string {
  const name = (entity.properties["name"] as string) || entity.id;
  const tags = Array.from(entity.tags).join(", ");
  const desc = (entity.properties["description"] as string) || "";
  const secret = (entity.properties["secret"] as string) || "";
  const lines = [`- ${name} [${tags}]`];
  if (desc) lines.push(`  ${desc}`);
  // Include notable properties (skip hidden/boring ones)
  const props: string[] = [];
  for (const [key, value] of Object.entries(entity.properties)) {
    if (HIDDEN_PROPS.has(key)) continue;
    if (key === "name" || key === "description" || key === "secret") continue;
    if (value === false || value === 0 || value === undefined) continue;
    props.push(`${key}: ${JSON.stringify(value)}`);
  }
  if (props.length > 0) lines.push(`  Properties: ${props.join(", ")}`);
  if (secret) lines.push(`  Secret: ${secret}`);
  return lines.join("\n");
}

function sample<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return arr;
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, count);
}

/**
 * Build a prompt section describing the current room, adjacent rooms,
 * and a random sample of entities from each — including secrets.
 */
export function buildNearbyContext(
  store: EntityStore,
  { room, playerId }: { room: Entity; playerId: string },
): string {
  const sections: string[] = [];

  // Current room entities (sample 2)
  const roomContents = store.getContents(room.id).filter(isInteresting);
  if (roomContents.length > 0) {
    const sampled = sample(roomContents, 2);
    const roomName = (room.properties["name"] as string) || room.id;
    sections.push(`Current room (${roomName}):\n${sampled.map(describeEntityDetail).join("\n\n")}`);
  }

  // Adjacent rooms via exits (sample 2 entities per room, max 3 rooms)
  const exits = store.getContents(room.id).filter((e) => e.tags.has("exit"));
  const adjacentRooms: Array<{ room: Entity; entities: Entity[] }> = [];
  for (const exit of exits) {
    const destId = exit.properties["destination"] as string | undefined;
    if (!destId || !store.has(destId)) continue;
    const dest = store.get(destId);
    const contents = store.getContents(destId).filter(isInteresting);
    if (contents.length > 0) {
      adjacentRooms.push({ room: dest, entities: contents });
    }
  }
  const sampledRooms = sample(adjacentRooms, 3);
  for (const adj of sampledRooms) {
    const sampled = sample(adj.entities, 2);
    const adjName = (adj.room.properties["name"] as string) || adj.room.id;
    sections.push(`Adjacent (${adjName}):\n${sampled.map(describeEntityDetail).join("\n\n")}`);
  }

  // Player inventory (sample 2)
  const inventory = store.getContents(playerId).filter(isInteresting);
  if (inventory.length > 0) {
    const sampled = sample(inventory, 2);
    sections.push(`Carrying:\n${sampled.map(describeEntityDetail).join("\n\n")}`);
  }

  if (sections.length === 0) return "";

  return `<nearby-entities>
Entities in the current room, adjacent rooms, and player inventory.
You may create things that relate to or complement these, but don't have to.
These are shown for context — do not reference them by name in descriptions
unless there is a natural reason.

${sections.join("\n\n")}
</nearby-entities>`;
}
