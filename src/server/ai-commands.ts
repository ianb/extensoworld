import type { EntityStore, Entity } from "../core/entity.js";
import type { GamePrompts } from "../core/game-data.js";
import type { DebugInfo } from "../core/world.js";
import type { UnresolvedExitContext } from "../core/movement.js";
import type { VerbRegistry, ResolvedCommand } from "../core/verbs.js";
import type { WorldEvent } from "../core/verb-types.js";
import type { HandlerLib } from "../core/handler-lib.js";
import { describeRoomFull } from "../core/describe.js";
import { handleAiCreate } from "./ai-create.js";
import { handleAiCreateExit } from "./ai-create-exit.js";
import { handleAiCreateRoom } from "./ai-create-room.js";
import { handleVerbFallback } from "./verb-fallback.js";
import { getAiEntityIds, removeAiEntity } from "./ai-entity-store.js";

interface CommandResponse {
  output: string;
  aiOutput?: string;
  debug?: DebugInfo;
}

function describeCurrentRoom(store: EntityStore): string {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.properties["location"] as string;
  const room = store.get(roomId);
  return describeRoomFull(store, { room, playerId: player.id });
}

export async function handleAiCreateExitCommand(
  store: EntityStore,
  {
    instructions,
    gameId,
    prompts,
    debug,
  }: { instructions: string; gameId: string; prompts?: GamePrompts; debug?: boolean },
): Promise<CommandResponse> {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return { output: "No player found." };
  const roomId = player.properties["location"] as string;
  const room = store.get(roomId);
  const result = await handleAiCreateExit(store, {
    instructions,
    room,
    gameId,
    prompts,
    debug,
  });
  const roomDesc = describeCurrentRoom(store);
  return {
    output: roomDesc,
    aiOutput: result.output,
    debug:
      debug && result.debug
        ? {
            parse: `ai create exit "${instructions}"`,
            outcome: `created ${result.entityId}`,
            aiFallback: {
              systemPrompt: result.debug.systemPrompt,
              prompt: result.debug.prompt,
              response: result.debug.response,
              durationMs: result.debug.durationMs,
            },
          }
        : undefined,
  };
}

export async function handleAiCreateCommand(
  store: EntityStore,
  {
    description,
    gameId,
    prompts,
    debug,
  }: { description: string; gameId: string; prompts?: GamePrompts; debug?: boolean },
): Promise<CommandResponse> {
  const players = store.findByTag("player");
  const player = players[0];
  if (!player) return { output: "No player found." };
  const roomId = player.properties["location"] as string;
  const room = store.get(roomId);
  const result = await handleAiCreate(store, { description, room, gameId, prompts, debug });
  const roomDesc = describeCurrentRoom(store);
  return {
    output: roomDesc,
    aiOutput: result.output,
    debug:
      debug && result.debug
        ? {
            parse: `ai create "${description}"`,
            outcome: `created ${result.entityId}`,
            aiFallback: {
              systemPrompt: result.debug.systemPrompt,
              prompt: result.debug.prompt,
              response: result.debug.response,
              durationMs: result.debug.durationMs,
            },
          }
        : undefined,
  };
}

export function handleAiDestroyCommand(
  store: EntityStore,
  { objectName, gameId }: { objectName: string; gameId: string },
): CommandResponse {
  const aiIds = getAiEntityIds(gameId);
  let match: string | null = null;
  for (const id of aiIds) {
    if (!store.has(id)) continue;
    const entity = store.get(id);
    const name = ((entity.properties["name"] as string) || "").toLowerCase();
    const aliases = (entity.properties["aliases"] as string[]) || [];
    if (
      name === objectName ||
      id === objectName ||
      aliases.some((a) => a.toLowerCase() === objectName)
    ) {
      match = id;
      break;
    }
  }
  if (!match) {
    return { output: `No AI-created object matching "${objectName}" found.` };
  }
  const entity = store.get(match);
  const entityName = (entity.properties["name"] as string) || match;
  store.delete(match);
  removeAiEntity(gameId, match);
  return { output: `[Destroyed ${entityName} (${match})]` };
}

export async function handleUnresolvedExit(
  store: EntityStore,
  {
    context,
    gameId,
    prompts,
    debug,
  }: {
    context: UnresolvedExitContext;
    gameId: string;
    prompts?: GamePrompts;
    debug?: boolean;
  },
): Promise<CommandResponse> {
  console.log("[unresolved-exit] Calling handleAiCreateRoom");
  const result = await handleAiCreateRoom(store, {
    exit: context.exit,
    sourceRoom: context.room,
    gameId,
    prompts,
    debug,
  });
  console.log("[unresolved-exit] Room created:", result.roomId);

  // Move the player to the new room
  store.setProperty(context.player.id, { name: "location", value: result.roomId });
  console.log("[unresolved-exit] Player moved, describing room");

  const roomDesc = describeCurrentRoom(store);
  console.log("[unresolved-exit] Done");
  return {
    output: roomDesc,
    aiOutput: result.notes ? `Notes: ${result.notes}` : undefined,
    debug:
      debug && result.debug
        ? {
            parse: `go ${context.direction}`,
            outcome: `materialized ${result.roomId}`,
            aiFallback: {
              systemPrompt: result.debug.systemPrompt,
              prompt: result.debug.prompt,
              response: result.debug.response,
              durationMs: result.debug.durationMs,
            },
          }
        : undefined,
  };
}

interface UnhandledInput {
  command: ResolvedCommand;
  player: Entity;
  room: Entity;
}

interface FallbackResponse {
  output: string;
  aiOutput?: string;
  events: WorldEvent[];
  debug?: DebugInfo;
}

export async function handleVerbFallbackCommand(
  store: EntityStore,
  {
    unhandled,
    gameId,
    verbs,
    libClass,
    prompts,
    debug,
    existingDebug,
  }: {
    unhandled: UnhandledInput;
    gameId: string;
    verbs: VerbRegistry;
    libClass: typeof HandlerLib;
    prompts?: GamePrompts;
    debug?: boolean;
    existingDebug?: DebugInfo;
  },
): Promise<FallbackResponse> {
  const fallback = await handleVerbFallback(store, {
    command: unhandled.command,
    player: unhandled.player,
    room: unhandled.room,
    verbs,
    gameId,
    libClass,
    prompts,
    debug,
  });
  return {
    output: fallback.output,
    aiOutput: fallback.notes ? `Notes: ${fallback.notes}` : undefined,
    events: fallback.events,
    debug: existingDebug
      ? {
          ...existingDebug,
          outcome: fallback.handler ? `ai-${fallback.handler.name}` : "ai-fallback",
          aiFallback: fallback.debug,
        }
      : undefined,
  };
}
