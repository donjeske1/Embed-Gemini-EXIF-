import { GoogleGenAI, Modality, Part, Type } from "@google/genai";
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
    numberOfImages?: number;
}

// Helper to slugify a string for a filename
const slugify = (text: string): string => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')       // Replace spaces with -
        .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
        .replace(/\-\-+/g, '-')     // Replace multiple - with single -
        .substring(0, 50);          // Truncate to 50 chars
};


export const summarizePromptForFilename = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Summarize the following image prompt into 3-5 descriptive words, separated by hyphens. The output must be lowercase and contain only letters and hyphens. Example: "A photorealistic image of an astronaut on Mars" becomes "astronaut-on-mars".\n\nPrompt: "${prompt}"`,
            config: {
                systemInstruction: "You are an expert at creating concise, file-name-friendly summaries. Your output must be lowercase, hyphen-separated, and contain no special characters or file extensions.",
                maxOutputTokens: 20,
                thinkingConfig: { thinkingBudget: 0 } // Disable thinking for this simple task
            }
        });

        const summary = response.text.trim();
        // Final cleanup to ensure it's a valid slug
        return slugify(summary);
    } catch (error) {
        console.warn("AI filename summarization failed, using fallback.", error);
        // Fallback to simple truncation and slugification
        return slugify(prompt);
    }
};


// Helper for streaming JSON-based content
const streamAndParseJson = async (
    model: string,
    contents: string,
    config: any // Simplified for internal use
): Promise<any> => {
    // FIX: Await the generateContent call to ensure the response is fully received before parsing.
    const response = await ai.models.generateContent({ model, contents, config });
    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
};

export const generateExamplePromptsStream = async (): Promise<string[]> => {
    try {
        const result = await streamAndParseJson(
            'gemini-2.5-flash',
            `Generate 8 diverse and creative image generation prompts.`,
            {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { prompts: { type: Type.ARRAY, items: { type: Type.STRING, description: "A single, detailed and visually descriptive prompt." } } }
                },
                systemInstruction: "You are a creative assistant for an AI image generator. Your task is to generate a list of 8 distinct, visually descriptive, and detailed prompts. The prompts should cover a wide range of styles and subjects (e.g., photorealism, fantasy, watercolor, sci-fi, abstract). Return the response as a JSON object with a single key 'prompts' which is an array of strings. Do not include any other text or markdown formatting, just the raw JSON object.",
            }
        );

        if (result.prompts && Array.isArray(result.prompts)) {
            return result.prompts.filter(s => typeof s === 'string');
        }
        throw new Error("Invalid response format from example prompt generator.");

    } catch (error) {
        console.error("Error generating example prompts:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate example prompts: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating example prompts.");
    }
};

export const generateGroundedPromptStream = async function* (userPrompt: string): AsyncGenerator<string> {
    try {
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: `Based on the user's request, use Google Search to find visual details and then write a single, detailed, descriptive prompt for a text-to-image generator. Output ONLY the final prompt text, with no additional commentary, labels, or formatting like markdown. User request: "${userPrompt}"`,
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: "You are an expert prompt writer for AI image generators. Your goal is to take a user's idea, use web search to gather specific visual details if necessary, and then synthesize that information into a single, rich, and effective prompt. You must only output the prompt itself."
            },
        });

        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
                yield text;
            }
        }
    } catch (error) {
        console.error("Error generating grounded prompt:", error);
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Failed to generate grounded prompt: ${message}`);
    }
};


export const enhancePromptStream = async (simplePrompt: string): Promise<string[]> => {
    try {
        const result = await streamAndParseJson(
            'gemini-2.5-flash',
            `Based on the following idea, create three diverse and detailed prompts for an image generator: "${simplePrompt}"`,
            {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { suggestions: { type: Type.ARRAY, items: { type: Type.STRING, description: "A single, detailed and visually descriptive prompt suggestion." } } }
                },
                systemInstruction: "You are a creative assistant for an AI image generator. Your task is to take a user's simple idea and expand it into three distinct, visually descriptive, and detailed prompts. The prompts should be suitable for a text-to-image model. Return the response as a JSON object with a single key 'suggestions' which is an array of strings. Do not include any other text or markdown formatting, just the raw JSON object.",
            }
        );

        if (result.suggestions && Array.isArray(result.suggestions)) {
            return result.suggestions.filter(s => typeof s === 'string');
        }
        throw new Error("Invalid response format from prompt enhancer.");

    } catch (error) {
        console.error("Error enhancing prompt:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to enhance prompt: ${error.message}`);
        }
        throw new Error("An unknown error occurred while enhancing the prompt.");
    }
};

export const describeImageStream = async function* (referenceImage: ReferenceImage): AsyncGenerator<string> {
    try {
        const imagePart = { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.data } };
        const textPart = { text: "Describe this image in detail. Your description should be a high-quality prompt that could be used to generate a similar image with an AI text-to-image model. Focus on the visual elements, style, composition, and mood." };
        
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
                yield text;
            }
        }
    } catch (error) {
        console.error("Error describing image:", error);
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Failed to describe image: ${message}`);
    }
};

export const refineImage = async (
    prompt: string,
    referenceImage: ReferenceImage
): Promise<string> => {
    try {
        const imagePart = { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.data } };
        const textPart = { text: prompt };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const candidate = response.candidates?.[0];

        if (!candidate || !candidate.content || !candidate.content.parts) {
            const finishReason = candidate?.finishReason;
            let errorMessage = `Image refinement failed.`;
            if (finishReason) { errorMessage += ` Reason: ${finishReason}.`; }
            errorMessage += ` Please check your prompt for any policy violations.`;
            console.error("Image refinement failed or was blocked.", { response });
            throw new Error(errorMessage);
        }

        for (const part of candidate.content.parts) {
            if (part.inlineData) {
                return part.inlineData.data;
            }
        }
        throw new Error("No image data found in refinement API response.");

    } catch (error) {
        console.error("Error refining image:", error);
        throw error;
    }
};


export const generateImagesFromPrompt = async (
    prompt: string,
    model: ImageModel,
    config: GenerationConfig = {}
): Promise<string[]> => {
    try {
        const numImages = config.numberOfImages || 1;

        if (model === 'imagen-4.0-generate-001') {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: numImages,
                    aspectRatio: config.aspectRatio || '1:1',
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                return response.generatedImages.map(img => img.image.imageBytes);
            }
            throw new Error("No image data found in Imagen API response.");

        } else { // 'gemini-2.5-flash-image'
            const generationPromises: Promise<string>[] = Array.from({ length: numImages }).map(() => (async () => {
                const parts: Part[] = [];

                if (config.referenceImages && config.referenceImages.length > 0) {
                    parts.push(...config.referenceImages.map(image => ({
                        inlineData: { mimeType: image.mimeType, data: image.data }
                    })));
                }
                parts.push({ text: prompt });

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts },
                    config: { responseModalities: [Modality.IMAGE] },
                });

                const candidate = response.candidates?.[0];

                if (!candidate || !candidate.content || !candidate.content.parts) {
                    const finishReason = candidate?.finishReason;
                    let errorMessage = `Image generation failed.`;
                    if (finishReason) { errorMessage += ` Reason: ${finishReason}.`; }
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
            })());

            return await Promise.all(generationPromises);
        }
    } catch (error) {
        console.error("Error generating image:", error);
        if (error instanceof SyntaxError) {
             throw new Error("Invalid JSON format in prompt for Nano Banana model.");
        }
        throw error;
    }
};