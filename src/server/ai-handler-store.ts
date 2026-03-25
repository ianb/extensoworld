import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedCommand, VerbHandler, VerbContext, WorldEvent } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import { entityRef } from "../core/describe.js";

export interface AiHandlerRecord {
  createdAt: string;
  gameId: string;
  decision: "perform" | "refuse";
  verb: string;
  form: ParsedCommand["form"];
  entityId?: string;
  message: string;
  eventTemplates: Array<{
    type: string;
    property: string;
    value: unknown;
    description: string;
  }>;
}

function handlerFilePath(gameId: string): string {
  return resolve(process.cwd(), `data/ai-handlers-${gameId}.jsonl`);
}

function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export function saveHandlerRecord(record: AiHandlerRecord): void {
  ensureDataDir();
  appendFileSync(handlerFilePath(record.gameId), JSON.stringify(record) + "\n");
}

export function loadAiHandlers(gameId: string, verbs: VerbRegistry): void {
  const filePath = handlerFilePath(gameId);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return;
  const records = content.split("\n").map((line) => JSON.parse(line) as AiHandlerRecord);
  for (const record of records) {
    verbs.register(recordToHandler(record));
  }
}

export function recordToHandler(record: AiHandlerRecord): VerbHandler {
  const handlerName =
    record.decision === "refuse"
      ? `ai-refuse:${record.verb}-${record.entityId || "intransitive"}`
      : `ai-perform:${record.verb}-${record.entityId || "intransitive"}`;

  return {
    name: handlerName,
    source: "ai-handler-store",
    pattern: { verb: record.verb, form: record.form },
    priority: -1,
    entityId: record.entityId,
    freeTurn: record.decision === "refuse",
    perform(context: VerbContext) {
      if (record.decision === "refuse") {
        return { output: record.message, events: [] };
      }

      const target =
        context.command.form === "transitive" || context.command.form === "prepositional"
          ? context.command.object
          : context.command.form === "ditransitive"
            ? context.command.object
            : null;

      const events: WorldEvent[] = record.eventTemplates.map((t) => ({
        type: t.type,
        entityId: target ? target.id : "",
        property: t.property,
        value: t.value,
        oldValue: undefined,
        description: t.description,
      }));

      let output = record.message;
      if (target) {
        while (output.includes("{target}")) {
          output = output.replace("{target}", entityRef(target));
        }
      }

      return { output, events };
    },
  };
}
