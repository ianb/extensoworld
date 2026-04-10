import t from "tap";
import {
  mergeEntityPayload,
  mergeHandlerPayload,
  playSessionEdits,
} from "../src/server/agent-edit-merge.js";
import type { EntityData, HandlerData } from "../src/core/game-data.js";
import type { WorldEditRecord } from "../src/server/storage.js";

function entity(overrides: Partial<EntityData>): EntityData {
  return {
    id: "item:thing",
    tags: ["portable"],
    name: "Thing",
    description: "A thing.",
    location: "room:start",
    ...overrides,
  };
}

function edit(overrides: Partial<WorldEditRecord>): WorldEditRecord {
  return {
    seq: 1,
    gameId: "test",
    sessionId: "s-1",
    targetKind: "entity",
    targetId: "item:thing",
    op: "create",
    payload: null,
    priorState: null,
    applied: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

t.test("mergeEntityPayload overwrites top-level fields", (t) => {
  const current = entity({ name: "Old", description: "Old desc." });
  const merged = mergeEntityPayload(current, { name: "New" });
  t.equal(merged.name, "New");
  t.equal(merged.description, "Old desc.");
  t.end();
});

t.test("mergeEntityPayload merges properties bag with null erase", (t) => {
  const current = entity({ properties: { weight: 5, color: "red" } });
  const merged = mergeEntityPayload(current, {
    properties: { weight: 10, color: null },
  });
  t.same(merged.properties, { weight: 10 });
  t.end();
});

t.test("mergeEntityPayload removes properties bag when emptied", (t) => {
  const current = entity({ properties: { weight: 5 } });
  const merged = mergeEntityPayload(current, { properties: { weight: null } });
  t.equal(merged.properties, undefined);
  t.end();
});

t.test("mergeEntityPayload over null current treats as fresh create", (t) => {
  const merged = mergeEntityPayload(null, entity({ name: "Fresh" }));
  t.equal(merged.name, "Fresh");
  t.end();
});

t.test("mergeEntityPayload tags fully replace", (t) => {
  const current = entity({ tags: ["portable", "weapon"] });
  const merged = mergeEntityPayload(current, { tags: ["portable", "shiny"] });
  t.same(merged.tags, ["portable", "shiny"]);
  t.end();
});

t.test("mergeHandlerPayload overwrites all top-level fields", (t) => {
  const current: HandlerData = {
    name: "[examine]",
    pattern: { verb: "examine", form: "transitive" },
    perform: "return { output: 'old' };",
  };
  const merged = mergeHandlerPayload(current, {
    perform: "return { output: 'new' };",
  });
  t.equal(merged.perform, "return { output: 'new' };");
  t.equal(merged.name, "[examine]");
  t.end();
});

t.test("playSessionEdits create then update on same id uses prior intermediate", (t) => {
  const edits = [
    edit({
      seq: 1,
      op: "create",
      payload: entity({ name: "Original" }),
    }),
    edit({
      seq: 2,
      op: "update",
      payload: { name: "Updated" } as Partial<EntityData>,
    }),
  ];
  const played = playSessionEdits(edits, {
    startEntities: new Map([["item:thing", null]]),
    startHandlers: new Map(),
  });
  t.equal(played.resolved.length, 2);
  t.equal(played.resolved[0]!.priorState, null);
  t.same(
    (played.resolved[1]!.priorState as EntityData).name,
    "Original",
    "second edit's prior_state is the create payload",
  );
  const final = played.finalEntityState.get("item:thing")!;
  t.equal(final!.name, "Updated");
  t.end();
});

t.test("playSessionEdits delete leaves null final state and captures prior", (t) => {
  const start = entity({ name: "Doomed" });
  const edits = [edit({ seq: 1, op: "delete", payload: null })];
  const played = playSessionEdits(edits, {
    startEntities: new Map([["item:thing", start]]),
    startHandlers: new Map(),
  });
  t.same(played.resolved[0]!.priorState, start);
  t.equal(played.finalEntityState.get("item:thing"), null);
  t.end();
});

t.test("playSessionEdits update over existing materialized state", (t) => {
  const start = entity({ properties: { weight: 5 } });
  const edits = [
    edit({
      seq: 1,
      op: "update",
      payload: { properties: { weight: 10, color: "red" } } as Partial<EntityData>,
    }),
  ];
  const played = playSessionEdits(edits, {
    startEntities: new Map([["item:thing", start]]),
    startHandlers: new Map(),
  });
  const final = played.finalEntityState.get("item:thing")!;
  t.same(final!.properties, { weight: 10, color: "red" });
  t.end();
});
