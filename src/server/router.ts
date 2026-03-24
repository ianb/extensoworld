import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { createSampleWorld, processCommand } from "../core/index.js";
import type { EntityStore } from "../core/index.js";

let store: EntityStore = createSampleWorld();

function describeCurrentRoom(s: EntityStore): string {
  const players = s.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.properties["location"] as string;
  const room = s.get(roomId);
  const name = (room.properties["name"] as string) || room.id;
  const description = (room.properties["description"] as string) || "";
  const exits = s.getExits(room.id);
  const exitDirs = exits.map((e) => e.properties["direction"] as string);
  const exitList = exitDirs.length > 0 ? exitDirs.join(", ") : "none";
  return `${name}\n\n${description}\n\nExits: ${exitList}`;
}

export const appRouter = router({
  look: publicProcedure.query(() => {
    return { output: describeCurrentRoom(store) };
  }),

  command: publicProcedure.input(z.object({ text: z.string() })).mutation(({ input }) => {
    const result = processCommand(store, input.text);
    return { output: result.output };
  }),

  reset: publicProcedure.mutation(() => {
    store = createSampleWorld();
    return { output: describeCurrentRoom(store) };
  }),
});

export type AppRouter = typeof appRouter;
