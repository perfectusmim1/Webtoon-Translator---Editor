import { GoogleGenAI, Type, Schema } from "@google/genai";
import { TextBubble } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = "gemini-2.5-flash";

/**
 * Helper to convert blob/file to base64
 */
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64 = base64String.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Automatically detects speech bubbles and translates them with style matching.
 */
export const autoDetectAndTranslate = async (imageBase64: string, targetLanguage: string = "English"): Promise<TextBubble[]> => {
  try {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        bubbles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              translated_text: {
                type: Type.STRING,
                description: `The ${targetLanguage} translation of the text inside the bubble.`,
              },
              original_text: {
                type: Type.STRING,
                description: "The original text found in the bubble.",
              },
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: "The exact bounding box of the speech bubble [ymin, xmin, ymax, xmax] (0-1000 scale). Be precise.",
              },
              text_color: {
                type: Type.STRING,
                description: "The dominat color of the original text in HEX format (e.g. #000000 or #FFFFFF).",
              },
              background_color: {
                type: Type.STRING,
                description: "The dominant background color of the bubble in HEX format (e.g. #FFFFFF or #000000).",
              }
            },
            required: ["translated_text", "box_2d", "text_color", "background_color"],
          },
        },
      },
    };

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: imageBase64,
            },
          },
          {
            text: `You are an expert Manga Typesetter and Translator. 
            1. Detect ALL speech bubbles, square narration boxes, and significant sound effects (SFX) in this image.
            2. Extract the text and translate it naturally into ${targetLanguage}.
            3. Identify the background color of the bubble and the text color exactly so the replacement looks native.
            4. Return precise bounding boxes.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.3, // Lower temperature for more precise bounding boxes
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    const result = JSON.parse(jsonText);
    
    if (!result.bubbles || !Array.isArray(result.bubbles)) {
        return [];
    }

    return result.bubbles.map((b: any, index: number) => ({
      id: `auto-${index}-${Date.now()}`,
      text: b.translated_text,
      originalText: b.original_text,
      box: {
        ymin: b.box_2d[0],
        xmin: b.box_2d[1],
        ymax: b.box_2d[2],
        xmax: b.box_2d[3],
      },
      textColor: b.text_color,
      backgroundColor: b.background_color,
      isManual: false,
    }));

  } catch (error) {
    console.error("Auto detection error:", error);
    throw error;
  }
};

/**
 * Translates a specific cropped region manually selected by the user.
 */
export const translateRegion = async (imageBase64: string, targetLanguage: string = "English"): Promise<{text: string, textColor: string, backgroundColor: string}> => {
    try {
        const schema: Schema = {
            type: Type.OBJECT,
            properties: {
                translated_text: { type: Type.STRING },
                text_color: { type: Type.STRING, description: "Hex color of original text" },
                background_color: { type: Type.STRING, description: "Hex color of background" }
            },
            required: ["translated_text", "text_color", "background_color"]
        };

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: imageBase64
                        }
                    },
                    {
                        text: `Translate the text in this crop to ${targetLanguage}. Detect text color and background color. Return JSON.`
                    }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        
        const result = JSON.parse(response.text || "{}");
        return {
            text: result.translated_text || "Error",
            textColor: result.text_color || "#000000",
            backgroundColor: result.background_color || "#FFFFFF"
        };
    } catch (error) {
        console.error("Region translation error:", error);
        return { text: "Error", textColor: "#000000", backgroundColor: "#FFFFFF" };
    }
}

/**
 * Retranslates a list of connected bubbles with context awareness.
 */
export const retranslateContextAware = async (
    bubbles: { id: string; text: string; originalText?: string }[], 
    targetLanguage: string
): Promise<{ id: string; text: string }[]> => {
    try {
        if (bubbles.length === 0) return [];

        const schema: Schema = {
            type: Type.OBJECT,
            properties: {
                translations: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            translated_text: { type: Type.STRING }
                        },
                        required: ["id", "translated_text"]
                    }
                }
            }
        };

        // Create a conversation log for the AI
        const dialogueList = bubbles.map((b, i) => 
            `ID: ${b.id}\nCurrent Text: "${b.text}"${b.originalText ? `\nOriginal (if known): "${b.originalText}"` : ''}\nPosition: ${i + 1}`
        ).join('\n---\n');

        const prompt = `
        You are refining the translation of a Manga scene. 
        Here is a sequence of connected speech bubbles in the order they are read.
        
        Re-translate these bubbles to ${targetLanguage} so they flow naturally together as a conversation or narrative.
        Improve the context, grammar, and tone based on the fact that they are connected.
        
        Input Data:
        ${dialogueList}
        
        Return the ID and the new translated text for each bubble.
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { text: prompt },
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        const result = JSON.parse(response.text || "{}");
        if (!result.translations) return [];

        return result.translations.map((t: any) => ({
            id: t.id,
            text: t.translated_text
        }));

    } catch (error) {
        console.error("Context retranslation error:", error);
        return [];
    }
};