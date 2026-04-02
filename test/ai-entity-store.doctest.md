# AI Entity Store

```ts setup
import { EntityStore } from "../src/core/entity.js";
import { createRegistry } from "../src/core/properties.js";
import { defineBaseProperties } from "../src/core/base-properties.js";
import { saveAiEntity, loadAiEntities, removeAiEntity } from "../src/server/ai-entity-store.js";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

function makeStore(): EntityStore {
  const registry = createRegistry();
  defineBaseProperties(registry);
  return new EntityStore(registry, 1);
}

const testGameId = "test-ai-entity";
const testFile = resolve(process.cwd(), `data/ai-entities-${testGameId}.jsonl`);
function cleanup(): void {
  if (existsSync(testFile)) rmSync(testFile);
}
```

## Basic save and load

New entities are created in the store on load:

```
cleanup();
const store = makeStore();
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:test-widget",
  tags: ["portable"],
  name: "Widget",
  description: "A test widget",
  location: "world",
});
loadAiEntities(testGameId, store);
store.has("item:test-widget")
=> true
```

``` continue
store.get("item:test-widget").name
=> Widget
```

``` continue
cleanup();
```

## Property overrides on existing entities

When an AI entity record refers to an entity that already exists,
its properties are applied as overrides:

```
cleanup();
const store2 = makeStore();
store2.create("room:garden", {
  tags: ["room"],
  name: "Garden",
  room: { darkWhenUnlit: false, visits: 0, scenery: [] },
});
store2.create("exit:test-door", {
  tags: ["exit"],
  name: "Old Door",
  location: "room:garden",
  exit: {
    direction: "north",
    destinationIntent: "A hidden garden",
  },
});
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "exit:test-door",
  tags: ["exit"],
  name: "Garden Door",
  description: "A door to the garden",
  location: "room:garden",
  exit: {
    direction: "north",
    destination: "room:garden",
  },
});
loadAiEntities(testGameId, store2);
store2.get("exit:test-door").name
=> Garden Door
```

``` continue
store2.get("exit:test-door").exit.destination
=> room:garden
```

``` continue
cleanup();
```

## Remove entity

```
cleanup();
const store4 = makeStore();
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:to-remove",
  tags: ["portable"],
  name: "Doomed",
  description: "Will be removed",
  location: "world",
});
saveAiEntity({
  createdAt: "2024-01-01T00:00:00Z",
  gameId: testGameId,
  id: "item:to-keep",
  tags: ["portable"],
  name: "Keeper",
  description: "Will stay",
  location: "world",
});
removeAiEntity(testGameId, "item:to-remove");
loadAiEntities(testGameId, store4);
store4.has("item:to-remove")
=> false
```

``` continue
store4.has("item:to-keep")
=> true
```

``` continue
cleanup();
```
