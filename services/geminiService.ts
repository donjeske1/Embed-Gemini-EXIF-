import { GoogleGenAI, Modality, Part } from "@google/genai";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ReferenceImage {
    mimeType: string;
    data: string; // base64 encoded string, without the data URL prefix
}

export const generateImageFromPrompt = async (
    jsonPromptString: string,
    referenceImages?: ReferenceImage[]
): Promise<string> => {
    try {
        // First, ensure the text prompt is valid JSON.
        JSON.parse(jsonPromptString);

        const parts: Part[] = [];

        // Add reference images to the request parts, if they exist.
        if (referenceImages && referenceImages.length > 0) {
            for (const image of referenceImages) {
                parts.push({
                    inlineData: {
                        mimeType: image.mimeType,
                        data: image.data,
                    }
                });
            }
        }

        // Add the text prompt part.
        parts.push({ text: jsonPromptString });

        // The image generation model expects the entire prompt, even if it's complex JSON,
        // to be passed within a single 'text' part for the model to interpret.
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return part.inlineData.data;
            }
        }

        throw new Error("No image data found in API response.");

    } catch (error) {
        console.error("Error generating image:", error);
        if (error instanceof SyntaxError) {
             throw new Error("Invalid JSON format in prompt.");
        }
        throw error;
    }
};