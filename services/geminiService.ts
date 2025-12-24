import { GoogleGenAI, Type } from "@google/genai";
import { DriveFile } from "../types";

export const getAIAssistantResponse = async (files: DriveFile[], prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Du är en expert på släktforskning och historieberättande med fokus på det mänskliga perspektivet. 
    Här är en lista på filer som representerar någons minnen: 
    ${JSON.stringify(files.map(f => ({ name: f.name, type: f.type, description: f.description })))}
    
    Fråga: ${prompt}
    
    Hjälp användaren att skapa en varm och levande livsberättelse. Fokusera på familjehistoria, milstolpar, vardagsliv och personliga resor snarare än bara formell dokumentation. Ge förslag på kapitelindelningar som gör historien gripande för framtida generationer. Skriv inspirerande, respektfullt och engagerande.`,
  });

  return response.text;
};

export const suggestMetadata = async (files: DriveFile[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analysera dessa filnamn och beskrivningar. Föreslå en varm, personlig och vacker huvudtitel för denna samling av familjeminnen.
    Filer: ${files.map(f => `${f.name}: ${f.description || ''}`).join(', ')}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedTitle: { type: Type.STRING },
          suggestedDescription: { type: Type.STRING },
        },
        required: ["suggestedTitle", "suggestedDescription"]
      }
    }
  });

  try {
    const jsonStr = (response.text || "{}").trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    return { suggestedTitle: "Vår Familjehistoria", suggestedDescription: "Ett bevarat minne för framtida generationer." };
  }
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const base64Data = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(audioBlob);
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: audioBlob.type || 'audio/mp3',
            data: base64Data
          }
        },
        { text: "Transkribera detta ljudklipp ordagrant. Ignorera bakgrundsljud. Formatera texten läsbart." }
      ]
    }
  });

  return response.text || "Ingen transkription kunde genereras.";
};