import type { Entity } from "./entity.js";

class LibArgError extends Error {
  override name = "LibArgError";
  constructor(message: string) {
    super(message);
  }
}

export function requireString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new LibArgError(context + " must be a string");
  }
  return value;
}

export function requireEntity(value: unknown, context: string): Entity {
  if (!value || typeof value !== "object" || !("id" in value)) {
    throw new LibArgError(context + " must be an entity");
  }
  return value as Entity;
}

export function requireOpts(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new LibArgError(context + " expects an options object");
  }
  return value as Record<string, unknown>;
}
