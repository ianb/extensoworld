/**
 * Pull AI-generated data from production D1 into local JSONL files.
 *
 * Usage:
 *   npx tsx scripts/pull-d1-data.ts [--output data/] [--game colossal-cave]
 *
 * Pulls: ai_entities, ai_handlers, conversation_entries
 * Does NOT pull: events (per-user session data, not useful to sync)
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface CliArgs {
  output: string;
  game: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let output = "data";
  let game: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      output = args[i + 1]!;
      i++;
    } else if (args[i] === "--game" && args[i + 1]) {
      game = args[i + 1]!;
      i++;
    }
  }
  return { output, game };
}

interface D1QueryResult<T> {
  results: T[];
  success: boolean;
}

function queryD1<T>(sql: string): T[] {
  const raw = execSync(`npx wrangler d1 execute rooms-upon-rooms --remote --command "${sql}" --json`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const parsed = JSON.parse(raw) as D1QueryResult<T>[];
  if (!parsed[0] || !parsed[0].success) {
    throw new QueryError(sql);
  }
  return parsed[0].results;
}

class QueryError extends Error {
  override name = "QueryError";
  constructor(sql: string) {
    super(`D1 query failed: ${sql}`);
  }
}

interface EntityRow {
  game_id: string;
  id: string;
  tags: string;
  properties: string;
  created_at: string;
}

interface HandlerRow {
  game_id: string;
  name: string;
  data: string;
  created_at: string;
}

interface ConversationRow {
  game_id: string;
  user_id: string;
  npc_id: string;
  word: string;
  entry: string;
  created_at: string;
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJsonl(filePath: string, records: unknown[]): void {
  if (records.length === 0) return;
  ensureDir(filePath);
  const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(filePath, content);
  console.log(`  wrote ${records.length} records to ${filePath}`);
}

function run(): void {
  const { output, game } = parseArgs();
  const outDir = resolve(process.cwd(), output);
  const gameFilter = game ? ` WHERE game_id = '${game}'` : "";

  console.log("Pulling AI entities...");
  const entities = queryD1<EntityRow>(`SELECT * FROM ai_entities${gameFilter} ORDER BY game_id, created_at`);

  // Group by game_id
  const entitiesByGame = new Map<string, EntityRow[]>();
  for (const row of entities) {
    const list = entitiesByGame.get(row.game_id);
    if (list) {
      list.push(row);
    } else {
      entitiesByGame.set(row.game_id, [row]);
    }
  }
  for (const [gameId, rows] of entitiesByGame) {
    const records = rows.map((row) => ({
      id: row.id,
      tags: JSON.parse(row.tags),
      properties: JSON.parse(row.properties),
      createdAt: row.created_at,
      gameId: row.game_id,
    }));
    writeJsonl(resolve(outDir, `ai-entities-${gameId}.jsonl`), records);
  }

  console.log("Pulling AI handlers...");
  const handlers = queryD1<HandlerRow>(`SELECT * FROM ai_handlers${gameFilter} ORDER BY game_id, created_at`);

  const handlersByGame = new Map<string, HandlerRow[]>();
  for (const row of handlers) {
    const list = handlersByGame.get(row.game_id);
    if (list) {
      list.push(row);
    } else {
      handlersByGame.set(row.game_id, [row]);
    }
  }
  for (const [gameId, rows] of handlersByGame) {
    const records = rows.map((row) => {
      const data = JSON.parse(row.data);
      return { ...data, createdAt: row.created_at, gameId: row.game_id };
    });
    writeJsonl(resolve(outDir, `ai-handlers-${gameId}.jsonl`), records);
  }

  console.log("Pulling conversation entries...");
  const conversations = queryD1<ConversationRow>(
    `SELECT * FROM conversation_entries${gameFilter} ORDER BY game_id, npc_id, created_at`,
  );

  // Group by game_id + user_id + npc_id
  const convByKey = new Map<string, ConversationRow[]>();
  for (const row of conversations) {
    const key = `${row.game_id}/${row.user_id}/${row.npc_id}`;
    const list = convByKey.get(key);
    if (list) {
      list.push(row);
    } else {
      convByKey.set(key, [row]);
    }
  }
  for (const [key, rows] of convByKey) {
    const [gameId, userId, npcId] = key.split("/");
    const safeNpcId = npcId!.replace(/:/g, "_");
    const records = rows.map((row) => {
      const entry = JSON.parse(row.entry);
      return { ...entry, createdAt: row.created_at, gameId, userId, npcId };
    });
    writeJsonl(resolve(outDir, "npc", gameId!, userId!, `${safeNpcId}.jsonl`), records);
  }

  const totalEntities = entities.length;
  const totalHandlers = handlers.length;
  const totalConversations = conversations.length;
  console.log(`\nDone: ${totalEntities} entities, ${totalHandlers} handlers, ${totalConversations} conversations`);
}

run();
