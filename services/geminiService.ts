import { GoogleGenAI, Modality } from "@google/genai";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateImageFromPrompt = async (jsonPromptString: string): Promise<string> => {
    try {
        // First, ensure the input is valid JSON, as the app's contract expects.
        JSON.parse(jsonPromptString);

        // The image generation model expects the entire prompt, even if it's complex JSON,
        // to be passed within a single 'text' part for the model to interpret.
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: jsonPromptString }],
            },
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
