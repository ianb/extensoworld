import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type {
  RuntimeStorage,
  AiEntityRecord,
  AiHandlerRecord,
  EventLogEntry,
  WordEntryRecord,
} from "./storage.js";

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as T);
}

function appendJsonl(filePath: string, record: unknown): void {
  ensureDir(filePath);
  appendFileSync(filePath, JSON.stringify(record) + "\n");
}

export class FileStorage implements RuntimeStorage {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private path(...segments: string[]): string {
    return resolve(this.dataDir, ...segments);
  }

  // --- AI Entities ---

  async loadAiEntities(gameId: string): Promise<AiEntityRecord[]> {
    return readJsonl<AiEntityRecord>(this.path(`ai-entities-${gameId}.jsonl`));
  }

  async saveAiEntity(record: AiEntityRecord): Promise<void> {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record.properties)) {
      props[key] = value === undefined ? null : value;
    }
    appendJsonl(this.path(`ai-entities-${record.gameId}.jsonl`), { ...record, properties: props });
  }

  async getAiEntityIds(gameId: string): Promise<Set<string>> {
    const records = await this.loadAiEntities(gameId);
    return new Set(records.map((r) => r.id));
  }

  async removeAiEntity(gameId: string, entityId: string): Promise<boolean> {
    const filePath = this.path(`ai-entities-${gameId}.jsonl`);
    if (!existsSync(filePath)) return false;
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    const filtered = lines.filter((line) => {
      const record = JSON.parse(line) as AiEntityRecord;
      return record.id !== entityId;
    });
    if (filtered.length === lines.length) return false;
    writeFileSync(filePath, filtered.length > 0 ? filtered.join("\n") + "\n" : "");
    return true;
  }

  // --- AI Handlers ---

  async loadAiHandlers(gameId: string): Promise<AiHandlerRecord[]> {
    return readJsonl<AiHandlerRecord>(this.path(`ai-handlers-${gameId}.jsonl`));
  }

  async saveHandler(record: AiHandlerRecord): Promise<void> {
    appendJsonl(this.path(`ai-handlers-${record.gameId}.jsonl`), record);
  }

  async listHandlers(gameId: string): Promise<AiHandlerRecord[]> {
    return this.loadAiHandlers(gameId);
  }

  async removeHandler(gameId: string, name: string): Promise<boolean> {
    const filePath = this.path(`ai-handlers-${gameId}.jsonl`);
    if (!existsSync(filePath)) return false;
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    const filtered = lines.filter((line) => {
      const record = JSON.parse(line) as AiHandlerRecord;
      return record.name !== name;
    });
    if (filtered.length === lines.length) return false;
    writeFileSync(filePath, filtered.length > 0 ? filtered.join("\n") + "\n" : "");
    return true;
  }

  // --- Event Log ---

  async loadEvents(gameId: string): Promise<EventLogEntry[]> {
    return readJsonl<EventLogEntry>(this.path(`event-log-${gameId}.jsonl`));
  }

  async appendEvent(gameId: string, entry: EventLogEntry): Promise<void> {
    appendJsonl(this.path(`event-log-${gameId}.jsonl`), entry);
  }

  async clearEvents(gameId: string): Promise<void> {
    const filePath = this.path(`event-log-${gameId}.jsonl`);
    if (existsSync(filePath)) {
      writeFileSync(filePath, "");
    }
  }

  async popEvent(gameId: string): Promise<EventLogEntry | null> {
    const entries = await this.loadEvents(gameId);
    if (entries.length === 0) return null;
    const popped = entries.pop()!;
    const filePath = this.path(`event-log-${gameId}.jsonl`);
    ensureDir(filePath);
    if (entries.length === 0) {
      writeFileSync(filePath, "");
    } else {
      writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    }
    return popped;
  }

  // --- Conversations ---

  async loadConversationEntries(gameId: string, npcId: string): Promise<WordEntryRecord[]> {
    const safeId = npcId.replace(/:/g, "_");
    return readJsonl<WordEntryRecord>(this.path("npc", gameId, `${safeId}.jsonl`));
  }

  async saveWordEntry(record: WordEntryRecord): Promise<void> {
    const safeId = record.npcId.replace(/:/g, "_");
    appendJsonl(this.path("npc", record.gameId, `${safeId}.jsonl`), record);
  }
}
