import type { EntityData, HandlerData } from "../core/game-data.js";
import type { WordEntry } from "../core/conversation.js";
import type { WorldEvent } from "../core/verb-types.js";

/** Metadata added to AI-created entities */
export type AiEntityRecord = EntityData & {
  createdAt: string;
  gameId: string;
};

/** Metadata added to AI-created handlers */
export type AiHandlerRecord = HandlerData & {
  createdAt: string;
  gameId: string;
};

/** A single command's worth of events */
export interface EventLogEntry {
  command: string;
  events: WorldEvent[];
  timestamp: string;
}

/** Metadata added to AI-created conversation entries */
export interface WordEntryRecord extends WordEntry {
  createdAt: string;
  gameId: string;
  npcId: string;
}

/**
 * Abstract storage interface for runtime game data.
 *
 * Game definitions (base entities, handlers, prompts) are loaded
 * from files via readGameDir/loadGameData. This interface handles
 * the mutable runtime data: AI-created content and session events.
 */
export interface RuntimeStorage {
  // --- AI Entities ---
  loadAiEntities(gameId: string): Promise<AiEntityRecord[]>;
  saveAiEntity(record: AiEntityRecord): Promise<void>;
  getAiEntityIds(gameId: string): Promise<Set<string>>;
  removeAiEntity(gameId: string, entityId: string): Promise<boolean>;

  // --- AI Handlers ---
  loadAiHandlers(gameId: string): Promise<AiHandlerRecord[]>;
  saveHandler(record: AiHandlerRecord): Promise<void>;
  listHandlers(gameId: string): Promise<AiHandlerRecord[]>;
  removeHandler(gameId: string, name: string): Promise<boolean>;

  // --- Event Log ---
  loadEvents(gameId: string): Promise<EventLogEntry[]>;
  appendEvent(gameId: string, entry: EventLogEntry): Promise<void>;
  clearEvents(gameId: string): Promise<void>;
  popEvent(gameId: string): Promise<EventLogEntry | null>;

  // --- Conversations ---
  loadConversationEntries(gameId: string, npcId: string): Promise<WordEntryRecord[]>;
  saveWordEntry(record: WordEntryRecord): Promise<void>;
}
