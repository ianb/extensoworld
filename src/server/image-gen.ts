import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ReferenceImage {
  data: Uint8Array;
  mimeType: string;
}

export interface GenerateImageParams {
  prompt: string;
  stylePrompt: string;
  aspectRatio: string;
  referenceImage?: ReferenceImage;
}

export interface GeneratedImage {
  data: Uint8Array;
  mimeType: string;
}

class ImageGenConfigError extends Error {
  constructor() {
    super("GOOGLE_GENERATIVE_AI_API_KEY not set");
    this.name = "ImageGenConfigError";
  }
}

class ImageGenNoPartsError extends Error {
  constructor() {
    super("Image generation failed: no parts in response");
    this.name = "ImageGenNoPartsError";
  }
}

class ImageGenNoImageError extends Error {
  constructor() {
    super("Image generation failed: no image data in response");
    this.name = "ImageGenNoImageError";
  }
}

const IMAGE_GEN_TIMEOUT_MS = 60_000;

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!apiKey) {
    throw new ImageGenConfigError();
  }
  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

export async function generateImage(params: GenerateImageParams): Promise<GeneratedImage> {
  const client = getClient();
  // responseModalities and imageConfig are supported by the API but not yet in the SDK types
  const generationConfig = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: params.aspectRatio },
  } as Record<string, unknown>;
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: generationConfig as any,
  });

  const fullPrompt = [
    "<style-prompt>",
    params.stylePrompt,
    "</style-prompt>",
    "<subject>",
    params.prompt,
    "</subject>",
  ].join("\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  if (params.referenceImage) {
    parts.push({ text: "Use this as a style reference image:" });
    parts.push({
      inlineData: {
        data: uint8ToBase64(params.referenceImage.data),
        mimeType: params.referenceImage.mimeType,
      },
    });
  }
  parts.push({ text: fullPrompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });

    const response = result.response;
    const candidates = response.candidates;
    const firstCandidate = candidates && candidates[0];
    const responseParts = firstCandidate && firstCandidate.content && firstCandidate.content.parts;
    if (!responseParts) {
      throw new ImageGenNoPartsError();
    }

    for (const part of responseParts) {
      if (part.inlineData) {
        const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.codePointAt(0) || 0);
        return {
          data: bytes,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }

    throw new ImageGenNoImageError();
  } finally {
    clearTimeout(timeout);
  }
}
