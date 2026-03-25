import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { ResolvedCommand, VerbHandler, WorldEvent } from "../core/verb-types.js";
import type { VerbRegistry } from "../core/verbs.js";
import { getLlm } from "./llm.js";
import type { AiHandlerRecord } from "./ai-handler-store.js";
import { saveHandlerRecord, recordToHandler } from "./ai-handler-store.js";

export interface FallbackDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  durationMs: number;
}

/**
 * Result of the LLM deciding how to handle an unknown verb+object combination.
 * The LLM produces a reusable handler that is persisted to disk.
 */
export interface FallbackResult {
  output: string;
  events: WorldEvent[];
  /** The handler that was created and registered, if any */
  handler: VerbHandler | null;
  /** Debug info about the LLM call, included when debug mode is on */
  debug?: FallbackDebugInfo;
}

const fallbackResponseSchema = z.object({
  decision: z.enum(["perform", "refuse"]).describe(
    `"perform" if the action makes physical/logical sense for this type of object.
"refuse" if you understand the intent but the action shouldn't work.`,
  ),
  message: z
    .string()
    .describe(
      "The template text shown to the player. Use {{entityId|Name}} for entity references.",
    ),
  events: z
    .array(
      z.object({
        type: z.enum(["set-property"]),
        property: z.string(),
        value: z.unknown(),
        description: z.string(),
      }),
    )
    .describe(
      "Property changes to apply to the target object. Only used when decision is 'perform'. Properties must exist in the registry.",
    ),
});

function describeCommand(command: ResolvedCommand): string {
  if (command.form === "intransitive") return command.verb;
  if (command.form === "transitive") {
    return `${command.verb} ${entityName(command.object)}`;
  }
  if (command.form === "prepositional") {
    return `${command.verb} ${command.prep} ${entityName(command.object)}`;
  }
  return `${command.verb} ${entityName(command.object)} ${command.prep} ${entityName(command.indirect)}`;
}

function entityName(entity: Entity): string {
  return (entity.properties["name"] as string) || entity.id;
}

function describeEntityForLlm(entity: Entity): string {
  const tags = Array.from(entity.tags).join(", ");
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity.properties)) {
    // Skip verbose text fields — the LLM doesn't need them to decide
    if (key === "description" || key === "shortDescription") continue;
    props[key] = value;
  }
  return `- id: ${entity.id}\n  tags: [${tags}]\n  properties: ${JSON.stringify(props)}`;
}

function describeProperties(store: EntityStore): string {
  const defs = store.registry.definitions;
  const lines: string[] = [];
  for (const [name, def] of Object.entries(defs)) {
    lines.push(`- ${name} (${JSON.stringify(def.schema)}): ${def.description}`);
  }
  return lines.join("\n");
}

function buildPrompt(store: EntityStore, { command }: { command: ResolvedCommand }): string {
  const parts: string[] = [];

  parts.push(`## Action\nThe player typed: "${describeCommand(command)}"`);

  // Describe the target object(s) — this is what the handler is about
  const involved: Entity[] = [];
  if (command.form === "transitive" || command.form === "prepositional") {
    involved.push(command.object);
  }
  if (command.form === "ditransitive") {
    involved.push(command.object, command.indirect);
  }

  if (involved.length > 0) {
    const descs = involved.map((e) => {
      const desc = (e.properties["description"] as string) || "No description.";
      return `${describeEntityForLlm(e)}\n  description: "${desc}"`;
    });
    parts.push(`## Target Object(s)\n${descs.join("\n\n")}`);
  }

  parts.push(`## Available Properties\n${describeProperties(store)}`);

  return parts.join("\n\n");
}

const SYSTEM_PROMPT = `You are the game engine for a text adventure. The player has attempted an action that has no built-in handler. You must decide whether this action should work for this type of object.

Your response creates a REUSABLE handler — it should make sense regardless of which room the player is in. Think about the object's nature (its tags, properties, description), not the current situation.

## Decision

You must choose one of:

- "perform" — the action makes physical/logical sense for this kind of object. You MUST describe what happens and MAY include property changes as events.
- "refuse" — you understand the intent, but this shouldn't work for this object. Give a specific, in-character reason.

## Writing the message

- Keep it to 1-2 sentences in classic text adventure style.
- When refusing, be specific about WHY it fails based on the object's nature ("The lantern is made of solid brass — you can't break it with your bare hands."), never generic ("You can't do that.").
- You may reference entities using {{entityId|Display Name}} syntax, e.g. {{item:lantern|Brass lantern}}.

## Events (property changes)

Events let you change properties on the target object. Each event has:
- type: must be "set-property"
- property: the property name — MUST be one from the Available Properties list
- value: the new value, matching the property's schema type
- description: a short human-readable note about what changed

For example, to turn off a light:
  { "type": "set-property", "property": "switchedOn", "value": false, "description": "The lantern goes dark" }

If the action has no meaningful state change (just flavor text), return an empty events array.
Only use properties from the Available Properties list — do not invent new property names.

## Guidelines

- Be conservative. Most unusual actions should be refused.
- Only "perform" if the action is physically plausible given the object's tags and properties.
- Do not destroy important game objects without very good reason.
- A "perform" with no events is fine — not everything needs a state change (e.g., "shake lantern" might just produce flavor text).`;

/**
 * Ask the LLM to handle an unrecognized verb+object combination.
 * If the LLM decides the action should work, a new VerbHandler is registered
 * so the same action will work again without another LLM call.
 */
export async function handleVerbFallback(
  store: EntityStore,
  {
    command,
    player,
    room,
    verbs,
    gameId,
    debug,
  }: {
    command: ResolvedCommand;
    player: Entity;
    room: Entity;
    verbs: VerbRegistry;
    gameId: string;
    debug?: boolean;
  },
): Promise<FallbackResult> {
  const prompt = buildPrompt(store, { command });

  console.log("[ai-fallback] Calling LLM for:", describeCommand(command));
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: fallbackResponseSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;

  console.log(
    `[ai-fallback] Decision: ${response.decision} (${durationMs}ms) — "${response.message}"`,
  );

  // Get the target entity for the handler
  const targetEntity =
    command.form === "transitive" || command.form === "prepositional"
      ? command.object
      : command.form === "ditransitive"
        ? command.object
        : null;

  // Build the serializable record
  const record: AiHandlerRecord = {
    createdAt: new Date().toISOString(),
    gameId,
    decision: response.decision,
    verb: command.verb,
    form: command.form,
    entityId: targetEntity ? targetEntity.id : undefined,
    message: response.message,
    eventTemplates: response.events,
  };

  // Persist and register
  saveHandlerRecord(record);
  const handler = recordToHandler(record);
  verbs.register(handler);

  const debugInfo: FallbackDebugInfo | undefined = debug
    ? { systemPrompt: SYSTEM_PROMPT, prompt, response, durationMs }
    : undefined;

  if (response.decision === "refuse") {
    return { output: response.message, events: [], handler, debug: debugInfo };
  }

  // Execute immediately for the current command
  const performResult = handler.perform({ store, command, player, room });

  // Apply events
  for (const event of performResult.events) {
    if (event.type === "set-property" && event.property) {
      store.setProperty(event.entityId, { name: event.property, value: event.value });
    }
  }

  return { output: performResult.output, events: performResult.events, handler, debug: debugInfo };
}
