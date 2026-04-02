import type { JSONSchema7 } from "./json-schema.js";

export interface PropertyDefinition {
  name: string;
  description: string;
  schema: JSONSchema7;
  unit?: string;
  defaultValue?: unknown;
}

export interface PropertyRegistry {
  definitions: Record<string, PropertyDefinition>;
}

export class PropertyValidationError extends Error {
  constructor(
    public readonly propertyName: string,
    public readonly reason: string,
  ) {
    super(`Invalid value for property "${propertyName}": ${reason}`);
    this.name = "PropertyValidationError";
  }
}

export class UndefinedPropertyError extends Error {
  constructor(public readonly propertyName: string) {
    super(`Property "${propertyName}" is not defined in the registry`);
    this.name = "UndefinedPropertyError";
  }
}

/**
 * Simple schema validator that handles the subset of JSON Schema we actually use:
 * type (string/boolean/number/array), format (entity-ref), enum, array items.
 * Does not use code generation, so it works in Cloudflare Workers.
 */
function validateSchema(schema: JSONSchema7, value: unknown): string | null {
  const expectedType = schema.type as string | undefined;
  if (expectedType === "string") {
    if (typeof value !== "string") return `expected string, got ${typeof value}`;
  } else if (expectedType === "boolean") {
    if (typeof value !== "boolean") return `expected boolean, got ${typeof value}`;
  } else if (expectedType === "number") {
    if (typeof value !== "number") return `expected number, got ${typeof value}`;
  } else if (expectedType === "array") {
    if (!Array.isArray(value)) return `expected array, got ${typeof value}`;
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    return `expected one of [${schema.enum.join(", ")}], got ${JSON.stringify(value)}`;
  }
  return null;
}

export function createRegistry(definitions?: PropertyDefinition[]): PropertyRegistry {
  const registry: PropertyRegistry = { definitions: {} };
  if (definitions) {
    for (const def of definitions) {
      registry.definitions[def.name] = def;
    }
  }
  return registry;
}

export function defineProperty(registry: PropertyRegistry, definition: PropertyDefinition): void {
  registry.definitions[definition.name] = definition;
}

export function validateValue(
  registry: PropertyRegistry,
  entry: { name: string; value: unknown },
): string[] {
  const def = registry.definitions[entry.name];
  if (!def) {
    return [`Property "${entry.name}" is not defined in the registry`];
  }
  const error = validateSchema(def.schema, entry.value);
  if (error) return [`${entry.name}: ${error}`];
  return [];
}

/** Typed base properties shared across all games, plus arbitrary game-specific keys */
export interface PropertyBag {
  shortDescription?: string;
  open?: boolean;
  locked?: boolean;
  unlockedBy?: string;
  carryingCapacity?: number;
  score?: number;
  maxScore?: number;
  lit?: boolean;
  switchedOn?: boolean;
  fixed?: boolean;
  takeRefusal?: string;
  worn?: boolean;
  depositPoints?: number;
  pairedDoor?: string;
  powerRemaining?: number;
  [key: string]: unknown;
}

export function getProperty<T>(
  bag: PropertyBag,
  lookup: { registry: PropertyRegistry; name: string },
): T | undefined {
  if (!lookup.registry.definitions[lookup.name]) {
    throw new UndefinedPropertyError(lookup.name);
  }
  return bag[lookup.name] as T | undefined;
}

export function setProperty(
  bag: PropertyBag,
  assignment: { registry: PropertyRegistry; name: string; value: unknown },
): PropertyBag {
  const errors = validateValue(assignment.registry, {
    name: assignment.name,
    value: assignment.value,
  });
  if (errors.length > 0) {
    throw new PropertyValidationError(assignment.name, errors.join("; "));
  }
  return { ...bag, [assignment.name]: assignment.value };
}

export function getPropertyWithDefault<T>(
  bag: PropertyBag,
  lookup: { registry: PropertyRegistry; name: string },
): T {
  const def = lookup.registry.definitions[lookup.name];
  if (!def) {
    throw new UndefinedPropertyError(lookup.name);
  }
  const value = bag[lookup.name];
  if (value === undefined) {
    return def.defaultValue as T;
  }
  return value as T;
}
