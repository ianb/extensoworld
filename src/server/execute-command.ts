import { processCommand } from "../core/index.js";
import type { GameInstance } from "../games/registry.js";
import { appendEventLog } from "./event-log.js";
import { handleUnresolvedExit, handleVerbFallbackCommand } from "./ai-commands.js";
import { handleConversationWord, checkForConversationStart } from "./conversation-commands.js";
import { handleSceneryCheck } from "./scenery-commands.js";
import { handleSpecialCommand } from "./special-commands.js";

export interface CommandInput {
  gameId: string;
  text: string;
  debug?: boolean;
}

export async function executeCommand(
  input: CommandInput,
  { game, reinitGame }: { game: GameInstance; reinitGame: (slug: string) => GameInstance },
): Promise<{ output: string; debug?: unknown; conversationMode?: unknown; aiOutput?: string }> {
  const trimmed = input.text.trim();
  const opts = { gameId: input.gameId, prompts: game.prompts, debug: input.debug };

  // Conversation mode: route single-word input to conversation engine
  if (game.conversationState) {
    const convResult = await handleConversationWord(game, {
      word: trimmed,
      gameId: input.gameId,
    });
    return {
      output: convResult.output,
      conversationMode: convResult.conversationMode,
      debug: undefined,
    };
  }

  const special = handleSpecialCommand(trimmed, { game, gameId: input.gameId, opts, reinitGame });
  if (special) return special;

  // Extract [bracketed instructions] for AI guidance
  const bracketMatch = /\[([^\]]+)]/.exec(trimmed);
  const aiInstructions = bracketMatch ? bracketMatch[1] : undefined;
  const commandText = bracketMatch
    ? trimmed.slice(0, bracketMatch.index).trim() +
      trimmed.slice(bracketMatch.index + bracketMatch[0].length).trim()
    : trimmed;

  const result = processCommand(game.store, {
    input: commandText,
    verbs: game.verbs,
    debug: input.debug,
  });

  if (result.unresolvedExit) {
    return handleUnresolvedExit(game.store, { context: result.unresolvedExit, ...opts });
  }

  // Check for scenery — words in the room description that can be examined
  if (result.unresolvedObject) {
    const sceneryResult = await handleSceneryCheck(game, {
      verb: result.unresolvedObject.verb,
      objectName: result.unresolvedObject.objectName,
      gameId: input.gameId,
      prompts: game.prompts,
      debug: input.debug,
    });
    if (sceneryResult) {
      return { output: sceneryResult.output, debug: sceneryResult.debug || result.debug };
    }
  }

  if (result.unhandled) {
    const fallback = await handleVerbFallbackCommand(game.store, {
      unhandled: result.unhandled,
      gameId: input.gameId,
      verbs: game.verbs,
      libClass: game.libClass,
      prompts: game.prompts,
      debug: input.debug,
      existingDebug: result.debug,
      aiInstructions,
    });
    if (fallback.events.length > 0) {
      appendEventLog(input.gameId, {
        command: trimmed,
        events: fallback.events,
        timestamp: new Date().toISOString(),
      });
    }
    return { output: fallback.output, aiOutput: fallback.aiOutput, debug: fallback.debug };
  }

  // Don't persist start-conversation events (ephemeral)
  const persistEvents = result.events.filter((e) => e.type !== "start-conversation");
  if (persistEvents.length > 0) {
    appendEventLog(input.gameId, {
      command: trimmed,
      events: persistEvents,
      timestamp: new Date().toISOString(),
    });
  }

  // Check if a start-conversation event was emitted
  const convStart = checkForConversationStart(game, {
    events: result.events,
    gameId: input.gameId,
  });
  if (convStart) {
    return {
      output: convStart.output,
      conversationMode: convStart.conversationMode,
      debug: result.debug,
    };
  }

  return { output: result.output, debug: result.debug };
}
