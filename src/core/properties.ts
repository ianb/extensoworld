import type { JSONSchema7, JSONSchema7Type } from "./json-schema.js";

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
  return validateAgainstSchema({ value: entry.value, schema: def.schema, path: entry.name });
}

interface SchemaValidation {
  value: unknown;
  schema: JSONSchema7;
  path: string;
}

function validateAgainstSchema(sv: SchemaValidation): string[] {
  const { value, schema, path } = sv;
  const errors: string[] = [];

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getJsonType(value);
    if (!types.includes(actualType)) {
      errors.push(`${path}: expected type ${types.join(" | ")}, got ${actualType}`);
      return errors;
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: value ${value} is less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: value ${value} is greater than maximum ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(
        `${path}: string length ${value.length} is less than minLength ${schema.minLength}`,
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(
        `${path}: string length ${value.length} is greater than maxLength ${schema.maxLength}`,
      );
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path}: value "${value}" is not one of: ${schema.enum.join(", ")}`);
    }
  }

  if (
    Array.isArray(value) &&
    schema.items &&
    typeof schema.items === "object" &&
    !Array.isArray(schema.items)
  ) {
    const itemSchema = schema.items;
    for (const [i, item] of value.entries()) {
      errors.push(
        ...validateAgainstSchema({ value: item, schema: itemSchema, path: `${path}[${i}]` }),
      );
    }
  }

  return errors;
}

function getJsonType(value: unknown): JSONSchema7Type {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const jsType = typeof value;
  if (jsType === "string") return "string";
  if (jsType === "number") return "number";
  if (jsType === "boolean") return "boolean";
  if (jsType === "object") return "object";
  return "string";
}

export type PropertyBag = Record<string, unknown>;

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
