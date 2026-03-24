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

  command: publicProcedure
    .input(z.object({ text: z.string(), debug: z.boolean().optional() }))
    .mutation(({ input }) => {
      const result = processCommand(store, { input: input.text, verbs, debug: input.debug });
      return { output: result.output, debug: result.debug };
    }),

  reset: publicProcedure.mutation(() => {
    resetWorld();
    return { output: describeCurrentRoom(store) };
  }),

  entities: publicProcedure.query(() => {
    const ids = store.getAllIds();
    return ids.map((id) => {
      const snap = store.getSnapshot(id);
      return { id: snap.id, name: (snap.properties["name"] as string) || snap.id, tags: snap.tags };
    });
  }),

  entity: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    if (!store.has(input.id)) return null;
    const current = store.getSnapshot(input.id);
    const initial = store.getInitialState(input.id);
    return { current, initial };
  }),
});

export type AppRouter = typeof appRouter;
