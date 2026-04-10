import { z } from "zod";
import type { Entity } from "../core/entity.js";
import type { ToolContext } from "./agent-tool-context.js";

/**
 * The shape returned to the agent for any entity. We strip internal fields
 * (none currently) and serialize properties as a plain object.
 */
function entityToView(e: Entity): Record<string, unknown> {
  const view: Record<string, unknown> = {
    id: e.id,
    tags: e.tags,
    name: e.name,
    description: e.description,
    location: e.location,
  };
  if (e.aliases && e.aliases.length > 0) view["aliases"] = e.aliases;
  if (e.secret) view["secret"] = e.secret;
  if (e.scenery && e.scenery.length > 0) view["scenery"] = e.scenery;
  if (e.exit) view["exit"] = e.exit;
  if (e.room) view["room"] = e.room;
  if (e.ai) view["ai"] = e.ai;
  if (Object.keys(e.properties).length > 0) view["properties"] = e.properties;
  return view;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const queryInputSchema = z.object({
  kind: z.enum(["get", "findByTag", "findByTagAt", "getContents", "getExits", "listHandlers"]),
  /** Used by `get`, `getContents`, `getExits`, `findByTagAt` (as `at`). */
  id: z.string().optional(),
  /** Used by `findByTag` and `findByTagAt`. */
  tag: z.string().optional(),
  /** Optional limit override; capped at MAX_LIMIT. */
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

export type QueryInput = z.infer<typeof queryInputSchema>;

export interface QueryResult {
  ok: true;
  results: unknown;
  totalMatched?: number;
  omittedCount?: number;
}

export interface QueryError {
  ok: false;
  error: string;
}

export function runQuery(context: ToolContext, input: QueryInput): QueryResult | QueryError {
  const { store } = context;
  const limit = Math.min(input.limit || DEFAULT_LIMIT, MAX_LIMIT);

  switch (input.kind) {
    case "get": {
      if (!input.id) return { ok: false, error: "'get' requires id." };
      if (!store.has(input.id)) {
        return { ok: false, error: `Entity ${input.id} does not exist.` };
      }
      return { ok: true, results: entityToView(store.get(input.id)) };
    }
    case "findByTag": {
      if (!input.tag) return { ok: false, error: "'findByTag' requires tag." };
      const all = store.findByTag(input.tag);
      return finite(all, limit);
    }
    case "findByTagAt": {
      if (!input.tag || !input.id) {
        return { ok: false, error: "'findByTagAt' requires tag and id." };
      }
      const all = store.findByTagAt(input.tag, input.id);
      return finite(all, limit);
    }
    case "getContents": {
      if (!input.id) return { ok: false, error: "'getContents' requires id." };
      const all = store.getContents(input.id);
      return finite(all, limit);
    }
    case "getExits": {
      if (!input.id) return { ok: false, error: "'getExits' requires id." };
      const all = store.getExits(input.id);
      return finite(all, limit);
    }
    case "listHandlers": {
      // VerbRegistry doesn't expose listing; return only handlers we've
      // seen via pending edits during this session. Live handlers require
      // a registry change beyond v1 scope.
      const seen = new Map<string, { name: string; op: string }>();
      for (const edit of context.pendingEdits) {
        if (edit.targetKind !== "handler") continue;
        seen.set(edit.targetId, { name: edit.targetId, op: edit.op });
      }
      return { ok: true, results: Array.from(seen.values()) };
    }
  }
}

function finite(entities: Entity[], limit: number): QueryResult {
  const total = entities.length;
  const sliced = entities.slice(0, limit);
  return {
    ok: true,
    results: sliced.map(entityToView),
    totalMatched: total,
    omittedCount: total > limit ? total - limit : 0,
  };
}
