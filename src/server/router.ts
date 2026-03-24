import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { createSampleWorld, processCommand, describeRoomFull } from "../core/index.js";
import type { EntityStore, VerbRegistry } from "../core/index.js";

let store: EntityStore;
let verbs: VerbRegistry;

function resetWorld(): void {
  const world = createSampleWorld();
  store = world.store;
  verbs = world.verbs;
}

resetWorld();

function describeCurrentRoom(s: EntityStore): string {
  const players = s.findByTag("player");
  const player = players[0];
  if (!player) return "No player found.";
  const roomId = player.properties["location"] as string;
  const room = s.get(roomId);
  return describeRoomFull(s, { room, playerId: player.id });
}

export const appRouter = router({
  look: publicProcedure.query(() => {
    return { output: describeCurrentRoom(store) };
  }),

  command: publicProcedure.input(z.object({ text: z.string() })).mutation(({ input }) => {
    const result = processCommand(store, { input: input.text, verbs });
    return { output: result.output };
  }),

  reset: publicProcedure.mutation(() => {
    resetWorld();
    return { output: describeCurrentRoom(store) };
  }),
});

export type AppRouter = typeof appRouter;
