import { generateObject } from "ai";
import { z } from "zod";
import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import { getLlm, getLlmProviderOptions } from "./llm.js";
import { describeProperties, collectTags, filterKnownProperties } from "./ai-prompt-helpers.js";
import { composeCreatePrompt } from "./ai-prompts.js";
import { saveAiEntity } from "./ai-entity-store.js";

export interface AiCreateRoomResult {
  output: string;
  notes?: string;
  roomId: string;
  debug?: AiCreateRoomDebugInfo;
}

export interface AiCreateRoomDebugInfo {
  systemPrompt: string;
  prompt: string;
  response: unknown;
  durationMs: number;
}

const roomEntitySchema = z.object({
  idSlug: z
    .string()
    .describe("Short kebab-case slug for the room ID, like 'narrow-cavern', 'sunlit-clearing'."),
  name: z.string().describe("Display name for the room, e.g. 'Narrow Cavern'."),
  description: z
    .string()
    .describe("Full room description the player sees when they enter or look. 2-4 sentences."),
  tags: z
    .array(z.string())
    .describe("Tags for the room. Always include 'room'. Add 'dark' tag if the room is dark."),
  properties: z
    .record(z.string(), z.unknown())
    .describe(
      "Room properties like dark, aiPrompt. Must use properties from the Available Properties list.",
    ),
  exitUpdate: z
    .object({
      name: z.string().optional().describe("New name for the exit, if it should change."),
      description: z
        .string()
        .optional()
        .describe("New description for the exit, if it should change."),
    })
    .optional()
    .describe(
      "Optional changes to the exit the player came through, now that the destination is known.",
    ),
  additionalExits: z
    .array(
      z.object({
        direction: z.string(),
        name: z.string(),
        description: z.string(),
        destinationIntent: z.string().describe("What this exit should lead to when materialized."),
        aliases: z.array(z.string()),
        properties: z.record(z.string(), z.unknown()),
      }),
    )
    .describe(
      "Additional unresolved exits from the new room (not counting the return exit, which is created automatically). Keep the world expandable but don't add too many \u2014 1-2 is usually enough.",
    ),
  contents: z
    .array(
      z.object({
        idSlug: z.string(),
        idCategory: z.string(),
        name: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        aliases: z.array(z.string()),
        properties: z.record(z.string(), z.unknown()),
      }),
    )
    .describe(
      "Objects, NPCs, or furniture to place in the new room. Keep it sparse \u2014 0-2 items. Only include things that make the room interesting or are implied by the intent.",
    ),
});

const roomResponseSchema = z.object({
  room: roomEntitySchema,
  notes: z
    .string()
    .describe(
      "Your reasoning about this room. Explain how you interpreted the exit's destinationIntent, what atmosphere you chose, why you added or didn't add contents. Flag if the intent was vague, if you had to make assumptions, or if the room might not connect well to the world. Shown to the game designer, not the player.",
    ),
});

function describeExitForLlm(entity: Entity): string {
  const dir = (entity.properties["direction"] as string) || "?";
  const dest = (entity.properties["destination"] as string) || "(unresolved)";
  const name = (entity.properties["name"] as string) || entity.id;
  return `- ${dir}: ${name} \u2192 ${dest}`;
}

function reverseDirection(direction: string): string {
  const reverses: Record<string, string> = {
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
  return reverses[direction.toLowerCase()] || "back";
}

function buildPrompt(
  store: EntityStore,
  { exit, sourceRoom }: { exit: Entity; sourceRoom: Entity },
): string {
  const parts: string[] = [];

  const intent = (exit.properties["destinationIntent"] as string) || "unknown destination";
  const direction = (exit.properties["direction"] as string) || "unknown";
  const exitName = (exit.properties["name"] as string) || exit.id;

  parts.push(
    `<exit-context>\nThe player is going ${direction} through "${exitName}".\nDestination intent: ${intent}\nReturn direction: ${reverseDirection(direction)}\nSource room: ${sourceRoom.properties["name"] || sourceRoom.id}\n</exit-context>`,
  );

  parts.push(
    `<source-room>\n- ${sourceRoom.properties["name"] || sourceRoom.id}: ${sourceRoom.properties["description"] || "No description."}\n</source-room>`,
  );

  const sourceExits = store.getContents(sourceRoom.id).filter((e) => e.tags.has("exit"));
  if (sourceExits.length > 0) {
    parts.push(
      `<source-room-exits>\n${sourceExits.map(describeExitForLlm).join("\n")}\n</source-room-exits>`,
    );
  }

  parts.push(`<available-properties>\n${describeProperties(store)}\n</available-properties>`);
  parts.push(`<existing-tags>\n${collectTags(store).join(", ")}\n</existing-tags>`);

  return parts.join("\n\n");
}

function buildSystemPrompt({ prompts, room }: { prompts?: GamePrompts; room: Entity }): string {
  const styleSection = composeCreatePrompt({ prompts, room });

  return `<role>
You are creating a new room for a text adventure game. The player has walked through an exit that leads to an unmaterialized destination. You must create the room, its contents, and any additional exits.
</role>

${styleSection}

<guidelines>
- The room must match the exit's destinationIntent \u2014 that's the primary constraint.
- Write the room description as what the player sees when entering. 2-4 sentences, vivid but concise.
- A return exit to the source room is created automatically \u2014 do NOT include it in additionalExits.
- Add 0-2 additional unresolved exits to keep the world expandable. Each needs a destinationIntent.
- Add 0-2 contents (objects, NPCs, furniture) only if they make the room interesting or are implied by the intent.
- You may optionally update the exit the player came through (exitUpdate) if, now that the destination is known, the exit name or description should change.
- "dark" means pitch black — the player sees nothing without a light source. Don't place visible objects (glowing moss, lit torches) in dark rooms unless they have the "lit" property.
- Set aiPrompt on the room if there's useful context for future AI operations in this room.
- Room contents should use existing tags and properties from the available lists.
</guidelines>`;
}

export async function handleAiCreateRoom(
  store: EntityStore,
  {
    exit,
    sourceRoom,
    gameId,
    prompts,
    debug,
  }: {
    exit: Entity;
    sourceRoom: Entity;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
  },
): Promise<AiCreateRoomResult> {
  const systemPrompt = buildSystemPrompt({ prompts, room: sourceRoom });
  const prompt = buildPrompt(store, { exit, sourceRoom });

  const direction = (exit.properties["direction"] as string) || "unknown";
  console.log("[ai-create-room] Materializing room via:", direction);
  const startTime = Date.now();

  const result = await generateObject({
    model: getLlm(),
    schema: roomResponseSchema,
    system: systemPrompt,
    prompt,
    providerOptions: getLlmProviderOptions(),
  });

  const durationMs = Date.now() - startTime;
  const response = result.object;
  const roomData = response.room;

  console.log(`[ai-create-room] Created: ${roomData.name} (${durationMs}ms)`);

  // Create room entity
  const baseRoomId = `room:${roomData.idSlug}`;
  let roomId = baseRoomId;
  if (store.has(roomId)) {
    let n = 2;
    while (store.has(`${baseRoomId}-${n}`)) {
      n += 1;
    }
    roomId = `${baseRoomId}-${n}`;
  }

  const roomProps: Record<string, unknown> = filterKnownProperties(store, {
    name: roomData.name,
    description: roomData.description,
    ...roomData.properties,
  });

  console.log("[ai-create-room] Creating room entity:", roomId);
  store.create(roomId, { tags: roomData.tags, properties: roomProps });
  saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: roomId,
    tags: roomData.tags,
    properties: roomProps,
  });

  // Resolve the exit: set destination, clear intent
  console.log("[ai-create-room] Resolving exit:", exit.id);
  store.setProperty(exit.id, { name: "destination", value: roomId });
  store.setProperty(exit.id, { name: "destinationIntent", value: undefined });

  // Apply optional exit updates
  if (roomData.exitUpdate) {
    if (roomData.exitUpdate.name) {
      store.setProperty(exit.id, { name: "name", value: roomData.exitUpdate.name });
    }
    if (roomData.exitUpdate.description) {
      store.setProperty(exit.id, { name: "description", value: roomData.exitUpdate.description });
    }
  }

  console.log("[ai-create-room] Creating return exit");
  const returnDir = reverseDirection(direction);
  const roomSlug = roomId.replace("room:", "");
  const returnExitId = `exit:${roomSlug}:${returnDir}`;
  const returnExitProps: Record<string, unknown> = {
    location: roomId,
    direction: returnDir,
    destination: sourceRoom.id,
    name: `Exit ${returnDir}`,
    description: `Leads back to ${sourceRoom.properties["name"] || sourceRoom.id}.`,
  };
  store.create(returnExitId, { tags: ["exit"], properties: returnExitProps });
  saveAiEntity({
    createdAt: new Date().toISOString(),
    gameId,
    id: returnExitId,
    tags: ["exit"],
    properties: returnExitProps,
  });

  console.log("[ai-create-room] Creating additional exits:", roomData.additionalExits.length);
  for (const exitData of roomData.additionalExits) {
    const exitDir = exitData.direction.toLowerCase().replace(/\s+/g, "-");
    const exitId = `exit:${roomSlug}:${exitDir}`;
    if (store.has(exitId)) continue;
    const exitProps: Record<string, unknown> = filterKnownProperties(store, {
      location: roomId,
      direction: exitData.direction,
      name: exitData.name,
      description: exitData.description,
      destinationIntent: exitData.destinationIntent,
      ...exitData.properties,
    });
    if (exitData.aliases.length > 0) {
      exitProps.aliases = exitData.aliases;
    }
    store.create(exitId, { tags: ["exit"], properties: exitProps });
    saveAiEntity({
      createdAt: new Date().toISOString(),
      gameId,
      id: exitId,
      tags: ["exit"],
      properties: exitProps,
    });
  }

  console.log("[ai-create-room] Creating contents:", roomData.contents.length);
  for (const item of roomData.contents) {
    const baseItemId = `${item.idCategory}:${item.idSlug}`;
    let itemId = baseItemId;
    if (store.has(itemId)) {
      let n = 2;
      while (store.has(`${baseItemId}-${n}`)) {
        n += 1;
      }
      itemId = `${baseItemId}-${n}`;
    }
    const itemProps: Record<string, unknown> = filterKnownProperties(store, {
      location: roomId,
      name: item.name,
      description: item.description,
      ...item.properties,
    });
    if (item.aliases.length > 0) {
      itemProps.aliases = item.aliases;
    }
    store.create(itemId, { tags: item.tags, properties: itemProps });
    saveAiEntity({
      createdAt: new Date().toISOString(),
      gameId,
      id: itemId,
      tags: item.tags,
      properties: itemProps,
    });
  }

  const debugInfo: AiCreateRoomDebugInfo | undefined = debug
    ? { systemPrompt, prompt, response, durationMs }
    : undefined;

  console.log("[ai-create-room] All entities created, building output");

  return {
    output: roomData.description,
    notes: response.notes || undefined,
    roomId,
    debug: debugInfo,
  };
}
