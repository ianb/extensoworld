import { EntityStore, WORLD_LOCATION } from "./entity.js";
import { createRegistry, defineProperty } from "./properties.js";
import { createDefaultVerbs } from "./default-verbs.js";
import type { VerbRegistry } from "./verbs.js";

interface SampleWorld {
  store: EntityStore;
  verbs: VerbRegistry;
}

export function createSampleWorld(): SampleWorld {
  const registry = createRegistry();

  defineProperty(registry, {
    name: "name",
    description: "Display name",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "description",
    description: "Text description shown to the player",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "location",
    description: "ID of the containing entity",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "direction",
    description: "Direction label for an exit",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "destination",
    description: "Target room ID for an exit",
    schema: { type: "string" },
  });

  defineProperty(registry, {
    name: "open",
    description: "Whether a container or door is open",
    schema: { type: "boolean" },
    defaultValue: false,
  });

  defineProperty(registry, {
    name: "locked",
    description: "Whether something is locked",
    schema: { type: "boolean" },
    defaultValue: false,
  });

  const store = new EntityStore(registry);

  // Rooms
  store.create("clearing", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Forest Clearing",
      description:
        "You stand in a sunlit clearing surrounded by tall oaks. A weathered stone bench sits beneath the largest tree. Paths lead in several directions.",
    },
  });

  store.create("deep-woods", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Deep Woods",
      description:
        "The canopy above is thick, filtering the light into green shafts. The forest floor is soft with fallen leaves. An old wooden chest sits half-hidden among the roots.",
    },
  });

  store.create("hillside", {
    tags: ["room"],
    properties: {
      location: WORLD_LOCATION,
      name: "Rocky Hillside",
      description:
        "Loose stones shift under your feet as you climb a gentle slope. From here you can see the forest stretching out to the west. A glint of metal catches your eye.",
    },
  });

  // Exits
  store.create("exit-clearing-north", {
    tags: ["exit"],
    properties: { location: "clearing", direction: "north", destination: "deep-woods" },
  });
  store.create("exit-clearing-east", {
    tags: ["exit"],
    properties: { location: "clearing", direction: "east", destination: "hillside" },
  });
  store.create("exit-deepwoods-south", {
    tags: ["exit"],
    properties: { location: "deep-woods", direction: "south", destination: "clearing" },
  });
  store.create("exit-hillside-west", {
    tags: ["exit"],
    properties: { location: "hillside", direction: "west", destination: "clearing" },
  });

  // Items in the clearing
  store.create("lantern", {
    tags: ["portable"],
    properties: {
      location: "clearing",
      name: "Lantern",
      description: "A brass lantern, slightly tarnished but still functional.",
    },
  });

  // Chest in the deep woods (openable container)
  store.create("chest", {
    tags: ["container", "openable"],
    properties: {
      location: "deep-woods",
      name: "Wooden Chest",
      description: "A sturdy wooden chest with iron bands. It looks old but well-made.",
      open: false,
    },
  });

  // Key inside the chest
  store.create("key", {
    tags: ["portable"],
    properties: {
      location: "chest",
      name: "Iron Key",
      description: "A heavy iron key with an ornate handle.",
    },
  });

  // Coin on the hillside
  store.create("coin", {
    tags: ["portable"],
    properties: {
      location: "hillside",
      name: "Silver Coin",
      description: "A tarnished silver coin with an unfamiliar crest.",
    },
  });

  // Player
  store.create("player", {
    tags: ["player"],
    properties: { location: "clearing", name: "You" },
  });

  const verbs = createDefaultVerbs();

  return { store, verbs };
}
