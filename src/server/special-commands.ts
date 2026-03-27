import type { EntityStore } from "../core/index.js";
import { describeRoomFull } from "../core/index.js";
import type { GameInstance } from "../games/registry.js";
import { clearEventLog, popEventLog } from "./event-log.js";
import { isRoomLit, darknessDescription } from "../core/darkness.js";
import {
  handleAiCreateExitCommand,
  handleAiCreateCommand,
  handleAiDestroyCommand,
  handleAiDestroyVerbCommand,
} from "./ai-commands.js";

interface CommandOpts {
  gameId: string;
  prompts?: GameInstance["prompts"];
  debug?: boolean;
}

type CommandReturn =
  | { output: string; debug?: unknown }
  | Promise<{ output: string; debug?: unknown }>;

function describeCurrentRoom(s: EntityStore): string {
  const players = s.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.properties["location"] as string;
  const room = s.get(roomId);
  if (!isRoomLit(s, { room, playerId: player.id })) {
    return darknessDescription();
  }
  return describeRoomFull(s, { room, playerId: player.id });
}

export function handleSpecialCommand(
  trimmed: string,
  {
    game,
    gameId,
    opts,
    reinitGame,
  }: {
    game: GameInstance;
    gameId: string;
    opts: CommandOpts;
    reinitGame?: (slug: string) => GameInstance;
  },
): CommandReturn | null {
  if (trimmed === "/undo" && reinitGame) {
    const popped = popEventLog(gameId);
    if (!popped) return { output: "Nothing to undo.", debug: undefined };
    const rebuilt = reinitGame(gameId);
    return { output: "[Undone]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
  }

  if (trimmed === "/reset" && reinitGame) {
    clearEventLog(gameId);
    const rebuilt = reinitGame(gameId);
    return { output: "[Reset]\n\n" + describeCurrentRoom(rebuilt.store), debug: undefined };
  }

  if (trimmed === "help ai") {
    return {
      output: [
        "AI & World-Editing Commands:",
        "  ai create <description>      — Create an object in the current room",
        "  ai create exit <description> — Create a new exit from the current room",
        "  ai destroy <object>          — Remove an AI-created object",
        "  ai destroy verb <search>     — Find and remove an AI-created verb handler",
        "",
        "System:",
        "  /undo  — Undo the last action",
        "  /reset — Reset the game to its initial state",
      ].join("\n"),
      debug: undefined,
    };
  }

  if (trimmed.startsWith("ai create exit ")) {
    const instructions = trimmed.slice("ai create exit ".length).trim();
    if (!instructions) return { output: "Usage: ai create exit <description>", debug: undefined };
    return handleAiCreateExitCommand(game.store, { instructions, ...opts });
  }

  if (trimmed.startsWith("ai create ")) {
    const description = trimmed.slice("ai create ".length).trim();
    if (!description) return { output: "Usage: ai create <description>", debug: undefined };
    return handleAiCreateCommand(game.store, { description, ...opts });
  }

  if (trimmed.startsWith("ai destroy verb confirm ")) {
    const name = trimmed.slice("ai destroy verb confirm ".length).trim();
    if (!name) return { output: "Usage: ai destroy verb confirm <name>", debug: undefined };
    return handleAiDestroyVerbCommand({ search: name, confirm: true, gameId, verbs: game.verbs });
  }

  if (trimmed.startsWith("ai destroy verb ")) {
    const search = trimmed.slice("ai destroy verb ".length).trim();
    if (!search) return { output: "Usage: ai destroy verb <search>", debug: undefined };
    return handleAiDestroyVerbCommand({ search, confirm: false, gameId, verbs: game.verbs });
  }

  if (trimmed.startsWith("ai destroy ")) {
    const objectName = trimmed.slice("ai destroy ".length).trim().toLowerCase();
    if (!objectName) return { output: "Usage: ai destroy <object>", debug: undefined };
    return handleAiDestroyCommand(game.store, { objectName, gameId });
  }

  return null;
}
