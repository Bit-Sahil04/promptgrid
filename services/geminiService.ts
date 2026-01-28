import { GoogleGenAI } from "@google/genai";

// Initialize the client. 
// Note: We create a new instance per call in components to ensure fresh API key if changed, 
// but here we export a helper function.
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates an image based on the provided text prompt using Gemini 2.5 Flash Image model.
 * @param prompt The text description of the image.
 * @returns A base64 data URL of the generated image.
 */
export const generateImageFromPrompt = async (prompt: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = getClient();
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      // Config for image generation (defaults usually work, but specifying 1:1 is safe)
      config: {
        imageConfig: {
          aspectRatio: "1:1", 
        }
      }
    });

    // Parse response to find the image part
    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${base64Data}`;
        }
      }
    }
    
    throw new Error("No image data found in response.");
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
};
