
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

export const generateGroundedPrompt = async (userPrompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Based on the user's request, use Google Search to find visual details and then write a single, detailed, descriptive prompt for a text-to-image generator. Output ONLY the final prompt text, with no additional commentary, labels, or formatting like markdown. User request: "${userPrompt}"`,
            // Fix: Moved systemInstruction into the config object.
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: "You are an expert prompt writer for AI image generators. Your goal is to take a user's idea, use web search to gather specific visual details if necessary, and then synthesize that information into a single, rich, and effective prompt. You must only output the prompt itself."
            },
        });

        const groundedPrompt = response.text;
        if (!groundedPrompt || groundedPrompt.trim() === '') {
            throw new Error("The model did not return a grounded prompt.");
        }
        return groundedPrompt.trim();

    } catch (error) {
        console.error("Error generating grounded prompt:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate grounded prompt: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating the grounded prompt.");
    }
};


export const enhancePrompt = async (simplePrompt: string): Promise<string[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Based on the following idea, create three diverse and detailed prompts for an image generator: "${simplePrompt}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                                description: "A single, detailed and visually descriptive prompt suggestion."
                            }
                        }
                    }
                },
                systemInstruction: "You are a creative assistant for an AI image generator. Your task is to take a user's simple idea and expand it into three distinct, visually descriptive, and detailed prompts. The prompts should be suitable for a text-to-image model. Return the response as a JSON object with a single key 'suggestions' which is an array of strings. Do not include any other text or markdown formatting, just the raw JSON object.",
            }
        });

        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);

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

export const describeImage = async (referenceImage: ReferenceImage): Promise<string> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType: referenceImage.mimeType,
                data: referenceImage.data,
            },
        };
        const textPart = {
            text: "Describe this image in detail. Your description should be a high-quality prompt that could be used to generate a similar image with an AI text-to-image model. Focus on the visual elements, style, composition, and mood."
        };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        const description = response.text;
        if (description) {
            return description.trim();
        }
        throw new Error("The model did not return a description.");
    } catch (error) {
        console.error("Error describing image:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to describe image: ${error.message}`);
        }
        throw new Error("An unknown error occurred while describing the image.");
    }
};

export const refineImage = async (
    prompt: string,
    referenceImage: ReferenceImage
): Promise<string> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType: referenceImage.mimeType,
                data: referenceImage.data,
            },
        };
        const textPart = { text: prompt };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const candidate = response.candidates?.[0];

        if (!candidate || !candidate.content || !candidate.content.parts) {
            const finishReason = candidate?.finishReason;
            let errorMessage = `Image refinement failed.`;
            if (finishReason) {
                errorMessage += ` Reason: ${finishReason}.`;
            }
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
            const generationPromises: Promise<string>[] = [];
            
            for (let i = 0; i < numImages; i++) {
                generationPromises.push((async () => {
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
                })());
            }

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
