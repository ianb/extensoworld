import { loadGameData } from "../../core/game-loader.js";
import { readGameDir } from "../read-game-dir.js";
import { xyzzy, plugh, plover, fee, fie, foe, foo, oldMagic } from "./magic-words.js";
import { catchBird, releaseBird, waterPlant, attackDragon, sayYes, feedBear } from "./puzzles.js";
import { takeTreasureScoring, dropTreasureScoring } from "./scoring.js";
import {
  giveTroll,
  takeBear,
  dropBear,
  bearFollows,
  lanternDrain,
  waveRod,
} from "./puzzles-more.js";
import { dwarfSpawn, dwarfEncounter, dwarfFollow, throwAxeAtDwarf } from "./dwarves.js";
import { pirateTick } from "./pirate.js";
import { caveClosingCheck, caveClosingCountdown, blast } from "./endgame.js";
import { registerGame } from "../registry.js";

const data = readGameDir(import.meta.dirname!);

registerGame({
  slug: data.meta.slug,
  title: data.meta.title,
  description: data.meta.description,
  create() {
    const game = loadGameData(data);

    // Register game-specific handlers (puzzles, NPCs, magic words, etc.)
    const allHandlers = [
      xyzzy,
      plugh,
      plover,
      fee,
      fie,
      foe,
      foo,
      oldMagic,
      catchBird,
      releaseBird,
      waterPlant,
      attackDragon,
      sayYes,
      feedBear,
      takeTreasureScoring,
      dropTreasureScoring,
      giveTroll,
      takeBear,
      dropBear,
      bearFollows,
      lanternDrain,
      waveRod,
      dwarfSpawn,
      dwarfEncounter,
      dwarfFollow,
      throwAxeAtDwarf,
      pirateTick,
      caveClosingCheck,
      caveClosingCountdown,
      blast,
    ];
    for (const handler of allHandlers) {
      game.verbs.register(handler);
    }

    game.store.snapshot();
    return game;
  },
});
