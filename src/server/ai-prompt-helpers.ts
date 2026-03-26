import type { EntityStore } from "../core/entity.js";
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

/** Filter properties to only include those defined in the store's registry */
export function filterKnownProperties(
  store: EntityStore,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (store.registry.definitions[key]) {
      result[key] = value;
    } else {
      console.warn(`[ai] Skipping unknown property: ${key}`);
    }
  }
  return result;
}

export function collectTags(store: EntityStore): string[] {
  const tags = new Set<string>();
  for (const id of store.getAllIds()) {
    const entity = store.get(id);
    for (const tag of entity.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).toSorted();
}
