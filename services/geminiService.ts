import { GoogleGenAI, Modality, Part } from "@google/genai";
import type { AspectRatio, ImageModel } from "../types";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ReferenceImage {
    mimeType: string;
    data: string; // base64 encoded string, without the data URL prefix
}

interface GenerationConfig {
    aspectRatio?: AspectRatio;
    referenceImages?: ReferenceImage[];
}

export const generateImageFromPrompt = async (
    prompt: string,
    model: ImageModel,
    config: GenerationConfig = {}
): Promise<string> => {
    try {
        if (model === 'imagen-4.0-generate-001') {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: config.aspectRatio || '1:1',
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                return response.generatedImages[0].image.imageBytes;
            }
            throw new Error("No image data found in Imagen API response.");

        } else { // 'gemini-2.5-flash-image'
            const parts: Part[] = [];

            if (config.referenceImages && config.referenceImages.length > 0) {
                for (const image of config.referenceImages) {
                    parts.push({
                        inlineData: { mimeType: image.mimeType, data: image.data }
                    });
                }
            }
            parts.push({ text: prompt });

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            const candidate = response.candidates?.[0];

            if (!candidate || !candidate.content || !candidate.content.parts) {
                const finishReason = candidate?.finishReason;
                let errorMessage = `Image generation failed.`;
                if (finishReason) {
                    errorMessage += ` Reason: ${finishReason}.`;
                }
                errorMessage += ` Please check your prompt and reference image for any policy violations.`;
                console.error("Image generation failed or was blocked.", { response });
                throw new Error(errorMessage);
            }

            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
            throw new Error("No image data found in Nano Banana API response.");
        }
    } catch (error) {
        console.error("Error generating image:", error);
        if (error instanceof SyntaxError) {
             throw new Error("Invalid JSON format in prompt for Nano Banana model.");
        }
        throw error;
    }
};