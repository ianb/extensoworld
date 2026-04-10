import { z } from "zod";

// --- Entity payload schemas ---

const sceneryEntrySchema = z.object({
  word: z.string(),
  aliases: z.array(z.string()).optional(),
  description: z.string(),
  rejection: z.string(),
});

const exitSchema = z.object({
  direction: z.string(),
  destination: z.string().optional(),
  destinationIntent: z.string().optional(),
});

const roomSchema = z.object({
  darkWhenUnlit: z.boolean().optional(),
  visits: z.number().optional(),
  grid: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
});

const aiSchema = z.object({
  prompt: z.string().optional(),
  conversationPrompt: z.string().optional(),
  imagePrompt: z.string().optional(),
});

/**
 * Full EntityData required for `create` ops. Mirrors the EntityData interface
 * in src/core/game-data.ts. `properties` is an arbitrary record.
 */
const entityCreateSchema = z.object({
  tags: z.array(z.string()),
  name: z.string(),
  description: z.string(),
  location: z.string(),
  aliases: z.array(z.string()).optional(),
  secret: z.string().optional(),
  scenery: z.array(sceneryEntrySchema).optional(),
  exit: exitSchema.optional(),
  room: roomSchema.optional(),
  ai: aiSchema.optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Partial EntityData for `update` ops. Every top-level field is optional;
 * `properties` entries with `null` value erase that property.
 */
const entityUpdateSchema = z.object({
  tags: z.array(z.string()).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  secret: z.string().optional(),
  scenery: z.array(sceneryEntrySchema).optional(),
  exit: exitSchema.optional(),
  room: roomSchema.optional(),
  ai: aiSchema.optional(),
  properties: z.record(z.string(), z.unknown().nullable()).optional(),
});

// --- Handler payload schemas ---

const handlerPatternSchema = z.object({
  verb: z.string(),
  verbAliases: z.array(z.string()).optional(),
  form: z.enum(["intransitive", "transitive", "prepositional", "ditransitive"]),
  prep: z.string().optional(),
});

const requirementsSchema = z.object({
  tags: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const handlerCreateSchema = z.object({
  pattern: handlerPatternSchema,
  priority: z.number().optional(),
  freeTurn: z.boolean().optional(),
  entityId: z.string().optional(),
  tag: z.string().optional(),
  objectRequirements: requirementsSchema.optional(),
  indirectRequirements: requirementsSchema.optional(),
  check: z.string().optional(),
  veto: z.string().optional(),
  perform: z.string(),
});

const handlerUpdateSchema = handlerCreateSchema.partial();

// --- Edit envelopes ---

const entityEditSchema = z.object({
  entity: z.object({
    id: z
      .string()
      .describe(
        'Entity id. For create: use a kebab-case slug like "item:rusty-sword". For update/delete: must reference an existing entity.',
      ),
    create: entityCreateSchema.optional(),
    value: entityUpdateSchema.optional(),
    delete: z
      .boolean()
      .optional()
      .describe("Set to true to delete this entity. Mutually exclusive with create/value."),
  }),
});

const handlerEditSchema = z.object({
  handler: z.object({
    name: z
      .string()
      .describe('Handler name. Convention: "ai-<verb>-<scope>" e.g. "ai-shout-room".'),
    create: handlerCreateSchema.optional(),
    value: handlerUpdateSchema.optional(),
    delete: z
      .boolean()
      .optional()
      .describe("Set to true to delete this handler. Mutually exclusive with create/value."),
  }),
});

export const editSchema = z.union([entityEditSchema, handlerEditSchema]);

export const editBatchSchema = z.object({
  edits: z.array(editSchema).min(1),
});

export type EditInput = z.infer<typeof editSchema>;
export type EditBatchInput = z.infer<typeof editBatchSchema>;

export { entityCreateSchema, entityUpdateSchema, handlerCreateSchema, handlerUpdateSchema };
