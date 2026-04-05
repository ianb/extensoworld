import { z } from "zod";
import { generateText } from "ai";
import { router, authedProcedure } from "./trpc.js";
import { getStorage } from "./storage-instance.js";
import { getImageStorage } from "./image-storage-instance.js";
import { generateImage } from "./image-gen.js";
import { getGame } from "../games/registry.js";
import { getLlm } from "./llm.js";

/**
 * Image endpoints available to authed users (not just admins).
 * Entity image generation requires admin role check inline.
 */
export const imageRouter = router({
  /** Check which entities have generated images */
  entityImageStatus: authedProcedure
    .input(z.object({ gameId: z.string(), entityIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const storage = getStorage();
      if (!storage.listWorldImages) return {};
      const images = await storage.listWorldImages(input.gameId);
      const result: Record<string, boolean> = {};
      for (const id of input.entityIds) {
        const imageType = `entity:${id}`;
        result[id] = images.some((img) => img.imageType === imageType);
      }
      return result;
    }),

  /** Generate an image for a specific entity (admin only) */
  generateEntityImage: authedProcedure
    .input(
      z.object({
        gameId: z.string(),
        entityId: z.string(),
        entityType: z.enum(["room", "npc"]),
        imagePrompt: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.roles.includes("admin")) {
        return { error: "Admin access required" };
      }

      const storage = getStorage();
      const settings = storage.getImageSettings
        ? await storage.getImageSettings(input.gameId)
        : null;

      const stylePrompt =
        input.entityType === "room"
          ? (settings && settings.imageStyleRoom) || ""
          : (settings && settings.imageStyleNpc) || "";

      if (!stylePrompt) {
        return { error: "No style prompt configured for this image type" };
      }

      // Look up entity's imagePrompt from game state
      let imagePrompt = input.imagePrompt;
      let entityDescription = "";
      if (!imagePrompt) {
        const def = getGame(input.gameId);
        if (def) {
          const instance = def.create();
          if (instance.store.has(input.entityId)) {
            const entity = instance.store.get(input.entityId);
            imagePrompt = (entity.ai && entity.ai.imagePrompt) || "";
            entityDescription = entity.description;
          }
        }
      }
      // Generate an imagePrompt via LLM if the entity doesn't have one
      if (!imagePrompt && entityDescription) {
        const result = await generateText({
          model: getLlm(),
          system: `You write concise image generation prompts. Given a text description of a ${input.entityType} in a game world, produce a visual description suitable for image generation. Focus on concrete visual details: colors, lighting, materials, composition, atmosphere. 1-3 sentences. Output ONLY the visual prompt, nothing else.`,
          prompt: entityDescription,
        });
        imagePrompt = result.text.trim();
      }
      if (!imagePrompt) {
        return { error: "Entity not found" };
      }

      // Load reference image if available
      const refType = input.entityType === "room" ? "room-reference" : "npc-reference";
      const refKey = `${input.gameId}/images/${refType}.png`;
      const imageStorage = getImageStorage();
      const refResult = await imageStorage.getImage(refKey);
      let referenceImage: { data: Uint8Array; mimeType: string } | undefined;
      if (refResult) {
        const data =
          refResult.data instanceof Uint8Array
            ? refResult.data
            : new Uint8Array(await new Response(refResult.data).arrayBuffer());
        referenceImage = { data, mimeType: refResult.mimeType };
      }

      const aspectRatio = input.entityType === "room" ? "16:9" : "3:4";
      const generated = await generateImage({
        prompt: imagePrompt,
        stylePrompt,
        aspectRatio,
        referenceImage,
      });

      const safeId = input.entityId.replace(/:/g, "/");
      const r2Key = `${input.gameId}/entities/${safeId}.png`;
      await imageStorage.putImage({
        key: r2Key,
        data: generated.data,
        mimeType: generated.mimeType,
      });

      const now = new Date().toISOString();
      const record = {
        gameId: input.gameId,
        imageType: `entity:${input.entityId}`,
        r2Key,
        promptUsed: imagePrompt,
        stylePrompt,
        mimeType: generated.mimeType,
        width: null,
        height: null,
        createdAt: now,
      };

      if (storage.saveWorldImage) {
        await storage.saveWorldImage(record);
      }

      return { imageUrl: `/api/images/${r2Key}` };
    }),
});
