import { z } from "zod";
import { tool } from "ai";
import type { ToolContext } from "./agent-tool-context.js";
import { editBatchSchema } from "./agent-tool-schemas.js";
import { applyEditBatch } from "./agent-tool-edits.js";
import { queryInputSchema, runQuery } from "./agent-tool-query.js";
import { jqInputSchema, runJq } from "./agent-tool-jq.js";

const saveVarSchema = z.object({
  name: z.string(),
  value: z.unknown(),
});

const getVarSchema = z.object({
  name: z.string(),
});

const finishSchema = z.object({
  summary: z.string().describe("A short description of what the agent accomplished."),
});

const bailSchema = z.object({
  reason: z.string().describe("Why the agent is giving up without committing edits."),
});

/**
 * Build the set of tools an agent loop can call. The same `context` object
 * is mutated by every tool: edits append to context.pendingEdits, save_var
 * mutates context.savedVars, finish/bail set context.terminate.
 */
export function buildAgentTools(context: ToolContext) {
  return {
    apply_edits: tool({
      description:
        "Apply a batch of structural edits to the world. Each edit either creates an entity (full data), updates an existing entity (partial overlay; properties: { key: null } erases that property), deletes an entity, or does any of these to a verb handler. The whole batch is rejected if any edit fails validation; nothing is half-applied. After acceptance, the edits become visible to subsequent query calls within this session, but only commit to the live world when finish() is called.",
      inputSchema: editBatchSchema,
      execute: async (input) => applyEditBatch(context, input),
    }),

    query: tool({
      description:
        "Read the world. Returns entities or handlers from the agent's view (live world ⊕ pending edits in this session). Hard-limited; the agent should pass a tag/id filter rather than expecting unbounded lists. Result objects can be passed to jq or saved to a variable.",
      inputSchema: queryInputSchema,
      execute: async (input) => runQuery(context, input),
    }),

    jq: tool({
      description:
        "Run a jq filter against either an inline JSON value or a previously-saved variable. Useful for paginating, projecting, or summarizing query results without dumping them all into context.",
      inputSchema: jqInputSchema,
      execute: async (input) => runJq(context, input),
    }),

    save_var: tool({
      description:
        "Persist a value to a session-scoped scratch slot under the given name. Useful for stashing query results or jq outputs to feed into a later jq call. Variables do not survive past finish()/bail().",
      inputSchema: saveVarSchema,
      execute: async (input) => {
        context.savedVars[input.name] = input.value;
        return { ok: true as const };
      },
    }),

    get_var: tool({
      description: "Retrieve a previously-saved variable by name.",
      inputSchema: getVarSchema,
      execute: async (input) => {
        if (!(input.name in context.savedVars)) {
          return { ok: false as const, error: `No variable named '${input.name}'.` };
        }
        return { ok: true as const, value: context.savedVars[input.name] };
      },
    }),

    finish: tool({
      description:
        "Commit all pending edits in this session and end the loop. Only call when the requested work is genuinely complete.",
      inputSchema: finishSchema,
      execute: async (input) => {
        context.terminate = { kind: "finish", summary: input.summary };
        return { ok: true as const };
      },
    }),

    bail: tool({
      description:
        "Abandon the session WITHOUT committing any pending edits. Use when the request is impossible, ambiguous, or the agent has reached an impasse.",
      inputSchema: bailSchema,
      execute: async (input) => {
        context.terminate = { kind: "bail", summary: input.reason };
        return { ok: true as const };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
