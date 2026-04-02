/**
 * One-off migration script: converts JSONL entity files from the old flat
 * properties format to the new structured format with typed top-level fields
 * and optional facets (exit, room, ai).
 *
 * Usage: npx tsx scripts/migrate-entity-format.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname!, "..");

// Properties that move to top-level Entity fields
const TOP_LEVEL_FIELDS = new Set([
  "name",
  "description",
  "location",
  "aliases",
  "secret",
]);

// Properties that move into the .exit facet
const EXIT_FIELDS: Record<string, string> = {
  direction: "direction",
  destination: "destination",
  destinationIntent: "destinationIntent",
};

// Properties that move into the .room facet
const ROOM_FIELDS = new Set(["dark", "visits", "scenery"]);
const GRID_FIELDS = new Set(["gridX", "gridY", "gridZ"]);

// Properties that move into the .ai facet
const AI_FIELDS: Record<string, string> = {
  aiPrompt: "prompt",
  aiConversationPrompt: "conversationPrompt",
};

interface OldEntity {
  id: string;
  tags: string[];
  properties: Record<string, unknown>;
}

interface NewEntity {
  id: string;
  tags: string[];
  name: string;
  description: string;
  location: string;
  aliases?: string[];
  secret?: string;
  exit?: {
    direction: string;
    destination?: string;
    destinationIntent?: string;
  };
  room?: {
    darkWhenUnlit?: boolean;
    visits?: number;
    scenery?: unknown[];
    grid?: { x: number; y: number; z: number };
  };
  ai?: {
    prompt?: string;
    conversationPrompt?: string;
  };
  properties?: Record<string, unknown>;
}

function migrateEntity(old: OldEntity): NewEntity {
  const props = { ...old.properties };
  const result: NewEntity = {
    id: old.id,
    tags: old.tags,
    name: (props["name"] as string) || old.id,
    description: (props["description"] as string) || "",
    location: (props["location"] as string) || "world",
  };

  // Extract top-level fields
  if (props["aliases"] && Array.isArray(props["aliases"]) && props["aliases"].length > 0) {
    result.aliases = props["aliases"] as string[];
  }
  if (props["secret"]) {
    result.secret = props["secret"] as string;
  }

  // Remove extracted top-level fields
  for (const field of TOP_LEVEL_FIELDS) {
    delete props[field];
  }

  // Extract exit facet
  const isExit = old.tags.includes("exit");
  if (isExit) {
    const exit: NewEntity["exit"] = {
      direction: (props["direction"] as string) || "",
    };
    if (props["destination"]) {
      exit.destination = props["destination"] as string;
    }
    if (props["destinationIntent"]) {
      exit.destinationIntent = props["destinationIntent"] as string;
    }
    result.exit = exit;
    for (const field of Object.keys(EXIT_FIELDS)) {
      delete props[field];
    }
  }

  // Extract room facet
  const isRoom = old.tags.includes("room");
  if (isRoom) {
    const room: NonNullable<NewEntity["room"]> = {};
    if (props["dark"] === true) {
      room.darkWhenUnlit = true;
    }
    if (props["visits"] !== undefined && props["visits"] !== 0) {
      room.visits = props["visits"] as number;
    }
    if (props["scenery"] && Array.isArray(props["scenery"]) && props["scenery"].length > 0) {
      room.scenery = props["scenery"] as unknown[];
    }
    // Grid coordinates
    const hasGrid =
      props["gridX"] !== undefined ||
      props["gridY"] !== undefined ||
      props["gridZ"] !== undefined;
    if (hasGrid) {
      room.grid = {
        x: (props["gridX"] as number) || 0,
        y: (props["gridY"] as number) || 0,
        z: (props["gridZ"] as number) || 0,
      };
    }
    if (Object.keys(room).length > 0) {
      result.room = room;
    }
    // Remove room fields
    for (const field of ROOM_FIELDS) {
      delete props[field];
    }
    for (const field of GRID_FIELDS) {
      delete props[field];
    }
    // Also remove "lit" from rooms — rooms don't have "lit", they have darkWhenUnlit
    // (lit stays on items like lanterns)
    delete props["lit"];
  }

  // Extract AI facet (rooms and regions can have these)
  const hasAiFields =
    props["aiPrompt"] !== undefined || props["aiConversationPrompt"] !== undefined;
  if (hasAiFields) {
    const ai: NonNullable<NewEntity["ai"]> = {};
    if (props["aiPrompt"]) {
      ai.prompt = props["aiPrompt"] as string;
    }
    if (props["aiConversationPrompt"]) {
      ai.conversationPrompt = props["aiConversationPrompt"] as string;
    }
    result.ai = ai;
    for (const field of Object.keys(AI_FIELDS)) {
      delete props[field];
    }
  }

  // Remaining properties stay in the bag
  if (Object.keys(props).length > 0) {
    result.properties = props;
  }

  return result;
}

function migrateEntityFile(filePath: string): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const migrated = lines.map((line) => {
    const old = JSON.parse(line) as OldEntity;
    return JSON.stringify(migrateEntity(old));
  });
  writeFileSync(filePath, migrated.join("\n") + "\n");
  console.log(`  Migrated ${lines.length} entities in ${filePath}`);
}

// Handler code string updates
function migrateHandlerCode(code: string): string {
  let result = code;

  // .tags.has( → .tags.includes(
  result = result.replace(/\.tags\.has\(/g, ".tags.includes(");

  // .properties['location'] or .properties["location"] or .properties.location → .location
  // Same for name, description, aliases, secret
  for (const field of ["location", "name", "description", "aliases", "secret"]) {
    result = result.replace(
      new RegExp(`\\.properties\\['${field}'\\]`, "g"),
      `.${field}`,
    );
    result = result.replace(
      new RegExp(`\\.properties\\["${field}"\\]`, "g"),
      `.${field}`,
    );
    result = result.replace(
      new RegExp(`\\.properties\\.${field}(?![a-zA-Z])`, "g"),
      `.${field}`,
    );
  }

  return result;
}

function migrateHandlerFile(filePath: string): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const migrated = lines.map((line) => {
    const handler = JSON.parse(line);
    if (handler.check) handler.check = migrateHandlerCode(handler.check);
    if (handler.veto) handler.veto = migrateHandlerCode(handler.veto);
    if (handler.perform) handler.perform = migrateHandlerCode(handler.perform);

    // Also update lib.createEntity calls: properties with name/location/etc
    // need to move to top level. This is too complex for regex — these are
    // rare and will need manual fixup.

    return JSON.stringify(handler);
  });
  writeFileSync(filePath, migrated.join("\n") + "\n");
  console.log(`  Migrated ${lines.length} handlers in ${filePath}`);
}

function wipeFile(filePath: string): void {
  if (existsSync(filePath)) {
    writeFileSync(filePath, "");
    console.log(`  Wiped ${filePath}`);
  }
}

// Entity JSONL files (not conversation or handler files)
const ENTITY_FILE_NAMES = [
  "room.jsonl",
  "exit.jsonl",
  "item.jsonl",
  "npc.jsonl",
  "player.jsonl",
  "region.jsonl",
  "door.jsonl",
];

const GAME_DIRS = [
  "src/games/the-aaru",
  "src/games/tinkermarket",
  "src/games/colossal-cave",
  "src/games/test-world",
];

console.log("=== Migrating entity JSONL files ===");
for (const dir of GAME_DIRS) {
  const fullDir = resolve(ROOT, dir);
  if (!existsSync(fullDir)) {
    console.log(`Skipping ${dir} (not found)`);
    continue;
  }
  console.log(`\n${dir}:`);
  for (const fileName of ENTITY_FILE_NAMES) {
    const filePath = join(fullDir, fileName);
    if (existsSync(filePath)) {
      migrateEntityFile(filePath);
    }
  }
}

console.log("\n=== Migrating handler JSONL files ===");
for (const dir of GAME_DIRS) {
  const fullDir = resolve(ROOT, dir);
  const handlerPath = join(fullDir, "handler.jsonl");
  if (existsSync(handlerPath)) {
    console.log(`\n${dir}:`);
    migrateHandlerFile(handlerPath);
  }
}

console.log("\n=== Wiping AI-generated content ===");
const dataDir = resolve(ROOT, "data");
if (existsSync(dataDir)) {
  const files = readdirSync(dataDir);
  for (const file of files) {
    if (file.startsWith("ai-entities-") || file.startsWith("ai-handlers-")) {
      wipeFile(join(dataDir, file));
    }
  }
}

console.log("\nDone! Review the changes before committing.");
