import type { D1Database, D1PreparedStatement, EntityRow, HandlerRow } from "./d1-types.js";
import { authoringBindValues } from "./d1-types.js";
import type { AiEntityRecord, AiHandlerRecord, AuthoringInfo } from "./storage.js";
import type { EntityData, HandlerData } from "../core/game-data.js";
import { deserializeEntityRow, serializeEntityRecord } from "./entity-serialize.js";
import { playSessionEdits } from "./agent-edit-merge.js";
import { getAgentSession, getSessionEdits, updateAgentSession } from "./storage-d1-agent.js";

class SessionNotFoundError extends Error {
  override name = "SessionNotFoundError";
  constructor(id: string) {
    super(`Agent session not found: ${id}`);
  }
}

function entityRecordFromHandlerRow(row: HandlerRow): HandlerData {
  // The data column already contains the full HandlerData (legacy
  // saveHandler stringifies the whole record). Strip the metadata fields
  // injected by AiHandlerRecord so we get back to a clean HandlerData.
  const parsed = JSON.parse(row.data) as HandlerData & {
    createdAt?: unknown;
    gameId?: unknown;
    authoring?: unknown;
  };
  const { createdAt: _ca, gameId: _gid, authoring: _au, ...rest } = parsed;
  return rest as HandlerData;
}

async function loadStartStates(
  db: D1Database,
  {
    gameId,
    entityIds,
    handlerNames,
  }: { gameId: string; entityIds: Set<string>; handlerNames: Set<string> },
): Promise<{
  startEntities: Map<string, EntityData | null>;
  startHandlers: Map<string, HandlerData | null>;
}> {
  const startEntities = new Map<string, EntityData | null>();
  for (const id of entityIds) {
    const row = await db
      .prepare("SELECT * FROM ai_entities WHERE game_id = ? AND id = ?")
      .bind(gameId, id)
      .first<EntityRow>();
    startEntities.set(id, row ? deserializeEntityRow(row) : null);
  }
  const startHandlers = new Map<string, HandlerData | null>();
  for (const name of handlerNames) {
    const row = await db
      .prepare("SELECT * FROM ai_handlers WHERE game_id = ? AND name = ?")
      .bind(gameId, name)
      .first<HandlerRow>();
    startHandlers.set(name, row ? entityRecordFromHandlerRow(row) : null);
  }
  return { startEntities, startHandlers };
}

function buildEntityWriteStatement(
  db: D1Database,
  {
    gameId,
    id,
    finalState,
    authoring,
    now,
  }: {
    gameId: string;
    id: string;
    finalState: EntityData | null;
    authoring: AuthoringInfo;
    now: string;
  },
): D1PreparedStatement {
  if (finalState === null) {
    return db.prepare("DELETE FROM ai_entities WHERE game_id = ? AND id = ?").bind(gameId, id);
  }
  const record: AiEntityRecord = {
    ...finalState,
    id,
    createdAt: now,
    gameId,
    authoring,
  };
  return db
    .prepare(
      `INSERT OR REPLACE INTO ai_entities
       (game_id, id, tags, properties, created_at, created_by, creation_source, creation_command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      gameId,
      id,
      JSON.stringify(record.tags),
      serializeEntityRecord(record),
      now,
      ...authoringBindValues(authoring),
    );
}

function buildHandlerWriteStatement(
  db: D1Database,
  {
    gameId,
    name,
    finalState,
    authoring,
    now,
  }: {
    gameId: string;
    name: string;
    finalState: HandlerData | null;
    authoring: AuthoringInfo;
    now: string;
  },
): D1PreparedStatement {
  if (finalState === null) {
    return db.prepare("DELETE FROM ai_handlers WHERE game_id = ? AND name = ?").bind(gameId, name);
  }
  const record: AiHandlerRecord = {
    ...finalState,
    name,
    createdAt: now,
    gameId,
    authoring,
  };
  return db
    .prepare(
      `INSERT OR REPLACE INTO ai_handlers
       (game_id, name, data, created_at, created_by, creation_source, creation_command)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(gameId, name, JSON.stringify(record), now, ...authoringBindValues(authoring));
}

/**
 * Atomically apply a session's pending edits:
 *  - Read the current materialized state for each touched target
 *  - Play the edits forward in seq order to compute prior_state per edit
 *    and the final post-session state per target
 *  - Build a batch of UPDATE/INSERT/DELETE statements against ai_entities,
 *    ai_handlers, world_edits, and agent_sessions
 *  - Execute as a single D1 batch
 */
export async function commitSession(
  db: D1Database,
  { sessionId, summary }: { sessionId: string; summary: string },
): Promise<void> {
  const session = await getAgentSession(db, sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);

  const edits = await getSessionEdits(db, sessionId);
  const pending = edits.filter((e) => !e.applied);
  if (pending.length === 0) {
    await updateAgentSession(db, {
      id: sessionId,
      patch: {
        status: "finished",
        summary,
        finishedAt: new Date().toISOString(),
      },
    });
    return;
  }

  const entityIds = new Set<string>();
  const handlerNames = new Set<string>();
  for (const edit of pending) {
    if (edit.targetKind === "entity") entityIds.add(edit.targetId);
    else handlerNames.add(edit.targetId);
  }

  const { startEntities, startHandlers } = await loadStartStates(db, {
    gameId: session.gameId,
    entityIds,
    handlerNames,
  });

  const played = playSessionEdits(pending, { startEntities, startHandlers });

  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  const authoring: AuthoringInfo = {
    createdBy: session.userId,
    creationSource: "agent",
    creationCommand: session.id,
  };

  for (const { edit, priorState } of played.resolved) {
    statements.push(
      db
        .prepare("UPDATE world_edits SET prior_state = ?, applied = 1 WHERE seq = ?")
        .bind(priorState === null ? null : JSON.stringify(priorState), edit.seq),
    );
  }

  for (const [id, finalState] of played.finalEntityState) {
    statements.push(
      buildEntityWriteStatement(db, {
        gameId: session.gameId,
        id,
        finalState,
        authoring,
        now,
      }),
    );
  }

  for (const [name, finalState] of played.finalHandlerState) {
    statements.push(
      buildHandlerWriteStatement(db, {
        gameId: session.gameId,
        name,
        finalState,
        authoring,
        now,
      }),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE agent_sessions
         SET status = 'finished', summary = ?, finished_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(summary, now, now, sessionId),
  );

  await db.batch(statements);
}
