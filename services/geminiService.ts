
import { GoogleGenAI, Type } from "@google/genai";
import { AspectRatio, ImageQuality, FilterType } from "../types";

const MODEL_NAME = 'gemini-2.5-flash-image';
const TEXT_MODEL = 'gemini-3-flash-preview';

const getQualityModifiers = (quality: ImageQuality): string => {
  switch (quality) {
    case "Ultra":
      return "hyper-realistic, 8k resolution, extreme detail, masterpiece, professional photography, cinematic lighting, ultra-sharp";
    case "HD":
      return "high definition, sharp focus, detailed textures, vibrant colors, clear visibility";
    default:
      return "standard quality, artistic, balanced lighting";
  }
};

const getRealisticModifiers = (isRealistic: boolean): string => {
  if (!isRealistic) return "";
  return "photorealistic, raw photo, shot on 35mm lens, f/1.8, depth of field, fujifilm aesthetic, highly detailed skin and fabric textures, natural lighting, masterpiece photography, 8k uhd";
};

const getFilterContext = (filter: FilterType): string => {
  switch (filter) {
    case "Grayscale": return "Apply a monochromatic black and white aesthetic.";
    case "Sepia": return "Apply a warm sepia-toned old photograph aesthetic.";
    case "Invert": return "Apply an inverted color negative aesthetic.";
    case "Vintage": return "Apply a vintage film aesthetic with muted colors and classic contrast.";
    case "Cyberpunk": return "Apply a futuristic cyberpunk aesthetic with neon pink and blue lighting and high contrast.";
    case "Solarize": return "Apply a solarized effect where colors are partially inverted for a surreal look.";
    case "NightVision": return "Apply a digital night vision effect with heavy green tint and high sensitivity.";
    case "Dramatic": return "Apply a dramatic look with deep shadows, high contrast, and slightly desaturated colors.";
    case "Dreamy": return "Apply a soft, ethereal dreamy look with high brightness, low contrast, and a slight glow.";
    case "Polaroid": return "Apply a classic instant photo look with warm tones and slight color fading.";
    default: return "";
  }
};

export const generateSingleImage = async (
  prompt: string, 
  negativePrompt: string,
  variationIndex: number, 
  aspectRatio: AspectRatio, 
  quality: ImageQuality,
  isRealistic: boolean
): Promise<{url: string, base64: string}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const variationModifiers = [
    "different perspective",
    "unique composition",
    "alternative lighting",
    "distinctive style"
  ];
  
  const qualityText = getQualityModifiers(quality);
  const realismText = getRealisticModifiers(isRealistic);
  
  let finalPrompt = `${prompt}, ${variationModifiers[variationIndex % variationModifiers.length]}, ${qualityText}`;
  if (realismText) {
    finalPrompt += `, ${realismText}`;
  }

  if (negativePrompt.trim()) {
    finalPrompt += `. STRICTLY AVOID and do not include the following in the image: ${negativePrompt}.`;
  }

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [{ text: finalPrompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = part.inlineData.data;
      return {
        url: `data:image/png;base64,${base64}`,
        base64
      };
    }
  }

  throw new Error("Nenhuma imagem foi gerada pelo modelo.");
};

export const editImage = async (
  base64Image: string, 
  editInstruction: string,
  aspectRatio: AspectRatio,
  filter: FilterType
): Promise<{url: string, base64: string}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const filterContext = getFilterContext(filter);
  
  const prompt = `Act as an expert image editor. Perform the following transformation on the provided image: "${editInstruction}".
  
  Instructions:
  1. If the instruction asks to add something, integrate it naturally into the scene with correct perspective, shadows, and reflections.
  2. If the instruction asks to replace something (e.g., "replace the sky"), swap that specific element while keeping the rest of the image intact.
  3. ${filterContext ? `The user has a ${filter} filter applied. Ensure the edited area matches this specific visual style: ${filterContext}` : 'Maintain the existing artistic style, lighting, and color palette.'}
  4. Ensure the transition between the original image and the edited parts is seamless.
  5. The final output must be photorealistic and high-resolution.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: 'image/png',
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = part.inlineData.data;
      return {
        url: `data:image/png;base64,${base64}`,
        base64
      };
    }
  }

  throw new Error("Não foi possível processar a edição complexa. Tente uma instrução mais específica.");
};

export const resizeImage = async (
  base64Image: string,
  newAspectRatio: AspectRatio
): Promise<{url: string, base64: string}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Expand and re-compose this image to a ${newAspectRatio} aspect ratio. 
  Ensure the main subjects are preserved and the background is naturally extended or re-cropped to fill the new frame beautifully. 
  Maintain high detail and consistent style.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: 'image/png',
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: newAspectRatio
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = part.inlineData.data;
      return {
        url: `data:image/png;base64,${base64}`,
        base64
      };
    }
  }

  throw new Error("Não foi possível redimensionar a imagem.");
};

export const applyStyleByDescription = async (description: string): Promise<{
  filter: FilterType,
  brightness: number,
  contrast: number,
  hue: number,
  saturation: number
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `Translate the following visual style description into specific technical color grading parameters: "${description}".
    
    Choose the closest base filter from this list: ["None", "Grayscale", "Sepia", "Invert", "Vintage", "Cyberpunk", "Solarize", "NightVision", "Dramatic", "Dreamy", "Polaroid"].
    Then adjust brightness (0-200), contrast (0-200), hue (0-360), and saturation (0-200).
    
    Defaults are: filter="None", brightness=100, contrast=100, hue=0, saturation=100.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          filter: { type: Type.STRING, enum: ["None", "Grayscale", "Sepia", "Invert", "Vintage", "Cyberpunk", "Solarize", "NightVision", "Dramatic", "Dreamy", "Polaroid"] },
          brightness: { type: Type.NUMBER },
          contrast: { type: Type.NUMBER },
          hue: { type: Type.NUMBER },
          saturation: { type: Type.NUMBER }
        },
        required: ["filter", "brightness", "contrast", "hue", "saturation"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};
