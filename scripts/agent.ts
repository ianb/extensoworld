/**
 * CLI for inspecting and managing agent sessions stored locally.
 *
 * Reads directly from the local FileStorage data directory (./data).
 *
 * Usage:
 *   npm run agent -- list                           # all sessions across all games
 *   npm run agent -- list <gameId>                  # sessions for one game
 *   npm run agent -- list <gameId> <status>         # filter by status
 *   npm run agent -- show <sessionId>               # session details + edits + messages
 *   npm run agent -- edits <sessionId>              # just the world edits
 *   npm run agent -- messages <sessionId>           # just the agent's transcript
 *   npm run agent -- broken <gameId>                # find materialized records that look partial
 *   npm run agent -- repair <gameId>                # remove fields that don't belong in partial overlays
 *
 * Statuses: running | finished | bailed | failed
 */

import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import type { AgentSessionRecord, WorldEditRecord, AiEntityRecord } from "../src/server/storage.js";

const dataDir = resolve(process.cwd(), "data");

function usage(message: string): never {
  console.error("Error:", message);
  process.exit(1);
}

function listGames(): string[] {
  if (!existsSync(dataDir)) return [];
  return readdirSync(dataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadSession(gameId: string, id: string): AgentSessionRecord | null {
  const path = resolve(dataDir, gameId, "agent-sessions", `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as AgentSessionRecord;
}

function findSession(id: string): { gameId: string; session: AgentSessionRecord } | null {
  for (const gameId of listGames()) {
    const session = loadSession(gameId, id);
    if (session) return { gameId, session };
  }
  return null;
}

function loadEdits(gameId: string, sessionId: string): WorldEditRecord[] {
  const path = resolve(dataDir, gameId, "world-edits.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as WorldEditRecord)
    .filter((e) => e.sessionId === sessionId);
}

function loadEntities(gameId: string): AiEntityRecord[] {
  const path = resolve(dataDir, gameId, "entities.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AiEntityRecord);
}

function listSessions(gameIdFilter?: string, statusFilter?: string): void {
  const games = gameIdFilter ? [gameIdFilter] : listGames();
  const rows: Array<AgentSessionRecord & { gameId: string }> = [];
  for (const gameId of games) {
    const dir = resolve(dataDir, gameId, "agent-sessions");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const session = JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as AgentSessionRecord;
      if (statusFilter && session.status !== statusFilter) continue;
      rows.push({ ...session, gameId });
    }
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (rows.length === 0) {
    console.log("(no sessions)");
    return;
  }
  console.log(`${rows.length} sessions:\n`);
  for (const r of rows) {
    const t = r.turnCount + "/" + r.turnLimit;
    const req = r.request.length > 60 ? r.request.slice(0, 57) + "..." : r.request;
    console.log(
      `  ${r.id}  [${r.status.padEnd(8)}]  ${r.gameId.padEnd(14)}  turns=${t.padEnd(7)}  ${req}`,
    );
  }
}

function showSession(id: string): void {
  const found = findSession(id);
  if (!found) {
    console.error(`Session not found: ${id}`);
    process.exit(1);
  }
  const { gameId, session } = found;
  const edits = loadEdits(gameId, id);
  const applied = edits.filter((e) => e.applied).length;

  console.log(`Session: ${session.id}`);
  console.log(`Game:    ${gameId}`);
  console.log(`User:    ${session.userId}`);
  console.log(`Status:  ${session.status}`);
  console.log(`Turns:   ${session.turnCount}/${session.turnLimit}`);
  console.log(`Created: ${session.createdAt}`);
  console.log(`Updated: ${session.updatedAt}`);
  if (session.finishedAt) console.log(`Done:    ${session.finishedAt}`);
  console.log("");
  console.log(`Request: ${session.request}`);
  console.log("");
  if (session.summary) {
    console.log(`Summary: ${session.summary}`);
    console.log("");
  }
  console.log(`Edits: ${edits.length} (${applied} applied)`);
  for (const e of edits) {
    const tag = e.applied ? "✓" : " ";
    const target = `${e.targetKind}:${e.targetId}`;
    console.log(`  ${tag} seq=${String(e.seq).padStart(3)}  ${e.op.padEnd(6)}  ${target}`);
  }
  console.log("");
  console.log(`Messages: ${session.messages.length} (use 'agent messages ${id}' to read)`);
  if (Object.keys(session.savedVars).length > 0) {
    console.log(`Saved vars: ${Object.keys(session.savedVars).join(", ")}`);
  }
}

function showEdits(id: string): void {
  const found = findSession(id);
  if (!found) {
    console.error(`Session not found: ${id}`);
    process.exit(1);
  }
  const edits = loadEdits(found.gameId, id);
  for (const e of edits) {
    console.log(`--- seq ${e.seq}  ${e.op} ${e.targetKind}:${e.targetId}  applied=${e.applied}`);
    if (e.payload !== null) {
      console.log("payload:", JSON.stringify(e.payload, null, 2));
    }
    if (e.priorState !== null) {
      console.log("prior:  ", JSON.stringify(e.priorState, null, 2));
    }
  }
}

function showMessages(id: string): void {
  const found = findSession(id);
  if (!found) {
    console.error(`Session not found: ${id}`);
    process.exit(1);
  }
  for (const [i, raw] of found.session.messages.entries()) {
    const msg = raw as { role: string; content: unknown };
    console.log(`--- [${i}] ${msg.role} ---`);
    if (typeof msg.content === "string") {
      console.log(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        const type = part["type"] as string;
        if (type === "text") {
          console.log("[text]", part["text"]);
        } else if (type === "tool-call") {
          console.log(`[tool-call] ${String(part["toolName"])}(${JSON.stringify(part["input"])})`);
        } else if (type === "tool-result") {
          const out = part["output"] as { value?: unknown } | undefined;
          console.log(
            `[tool-result] ${String(part["toolName"])}: ${JSON.stringify(out && out.value)}`,
          );
        } else {
          console.log(`[${type}]`, JSON.stringify(part));
        }
      }
    } else {
      console.log(JSON.stringify(msg.content));
    }
  }
}

const REQUIRED_TOP_LEVEL = ["name", "description", "tags", "location"] as const;

function findBroken(gameId: string): AiEntityRecord[] {
  const all = loadEntities(gameId);
  return all.filter((r) => REQUIRED_TOP_LEVEL.some((k) => r[k] === undefined));
}

function broken(gameId: string): void {
  const partials = findBroken(gameId);
  if (partials.length === 0) {
    console.log("(no broken records)");
    return;
  }
  console.log(`${partials.length} partial records (overlays on base-game entities):`);
  for (const r of partials) {
    const present = Object.keys(r).filter(
      (k) => k !== "id" && k !== "createdAt" && k !== "gameId" && k !== "authoring",
    );
    console.log(`  ${r.id}  fields=[${present.join(", ")}]`);
  }
  console.log("");
  console.log("These are partial overlays of base-game entities. With the loader fix,");
  console.log("they now apply correctly as overlays. No repair needed.");
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(
      [
        "Usage:",
        "  npm run agent -- list                          # all sessions",
        "  npm run agent -- list <gameId>                 # sessions for one game",
        "  npm run agent -- list <gameId> <status>        # filter by status",
        "  npm run agent -- show <sessionId>              # session details",
        "  npm run agent -- edits <sessionId>             # full edit payloads",
        "  npm run agent -- messages <sessionId>          # agent transcript",
        "  npm run agent -- broken <gameId>               # find partial-overlay records",
        "",
        "Statuses: running | finished | bailed | failed",
      ].join("\n"),
    );
    return;
  }

  if (cmd === "list") {
    listSessions(args[1], args[2]);
  } else if (cmd === "show") {
    if (!args[1]) usage("show requires a session id");
    showSession(args[1]);
  } else if (cmd === "edits") {
    if (!args[1]) usage("edits requires a session id");
    showEdits(args[1]);
  } else if (cmd === "messages") {
    if (!args[1]) usage("messages requires a session id");
    showMessages(args[1]);
  } else if (cmd === "broken") {
    if (!args[1]) usage("broken requires a gameId");
    broken(args[1]);
  } else {
    usage(`Unknown command: ${cmd}`);
  }
}

main();
