
import { GoogleGenAI, Modality } from "@google/genai";
import { COMPANY_INFO, KNOWLEDGE_BASE } from "../constants";
import { Agent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });

const LANGUAGE_BEHAVIOR: Record<string, { greeting: string, style: string, fillers: string }> = {
  'Malayalam': { 
    greeting: 'à´¨à´®à´¸àµà´à´¾à´°à´ (Namaskaram)', 
    style: 'Warm, youthful, and professional Keralite hospitality.',
    fillers: 'à´®àµà´®àµ (hmm), à´ªà´¿à´¨àµà´¨àµ (well), à´¨àµà´àµà´à´àµà´àµ (let me see)'
  },
  'Tamil': { 
    greeting: 'à®µà®£à®à¯à®à®®à¯ (Vanakkam)', 
    style: 'Bright, cheerful, and smart South Indian vibe.',
    fillers: 'à®®à¯à®®à¯ (hmm), à®à®°à®¿ (well), à®ªà®¾à®à¯à®à®²à®¾à®®à¯ (let me see)'
  },
  'Arabic': { 
    greeting: 'Ø§ÙØ³ÙØ§Ù Ø¹ÙÙÙÙ (Assalam Alaikum)', 
    style: 'Modern, generous, and welcoming Middle-Eastern style.',
    fillers: 'ÙÙÙ (hmm), Ø·ÙØ¨ (well), Ø£Ø´ÙÙ (let me see)'
  },
  'Urdu': { 
    greeting: 'Ø§ÙØ³ÙØ§Ù Ø¹ÙÛÚ©Ù (Assalam Alaikum)', 
    style: 'Polite, sweet, and helpful with a youthful touch.',
    fillers: 'ÛÙÚº (hmm), ØªÙ (well), Ø¯ÛÚ©Ú¾ÙÛ Ø¯ÛÚº (let me see)'
  },
  'Hindi': { 
    greeting: 'à¤¨à¤®à¤¸à¥à¤¤à¥ (Namaste)', 
    style: 'Friendly, modern, and energetic North Indian style.',
    fillers: 'à¤¹à¤®à¥à¤® (hmm), à¤¤à¥ (well), à¤¦à¥à¤à¤¤à¥ à¤¹à¥à¤ (let me see)'
  },
  'Telugu': { 
    greeting: 'à°¨à°®à°¸à±à°à°¾à°°à° (Namaskaram)', 
    style: 'Smart, polite, and welcoming.',
    fillers: 'à°®à±à°®à± (hmm), à°¸à°°à± (well), à°à±à°¦à±à°¦à°¾à° (let me see)'
  },
  'Kannada': { 
    greeting: 'à²¨à²®à²¸à³à²à²¾à²° (Namaskara)', 
    style: 'Youthful, direct, and very friendly.',
    fillers: 'à²¹à³à² (hmm), à²®à²¤à³à²¤à³ (well), à²¨à³à²¡à³à²£ (let me see)'
  },
  'Sinhala': { 
    greeting: 'à¶à¶ºà·à¶¶à·à·à¶±à· (Ayubowan)', 
    style: 'Sweet, traditional, and helpful.',
    fillers: 'à¶¸à·à¶¸à· (hmm), à¶à¶­à·à¶±à· (well), à¶¶à¶½à¶¸à· (let me see)'
  },
  'Tagalog': { 
    greeting: 'Kamusta Po', 
    style: 'Cheerful, bubbly, and very smart.',
    fillers: 'hmm, so (well), tingnan natin (let me see)'
  },
  'Kiswahili': { 
    greeting: 'Jambo / Habari', 
    style: 'Warm, lively, and energetic African vibe.',
    fillers: 'hmm, sawa (well), ngoja nione (let me see)'
  },
  'English': { 
    greeting: 'Hi there!', 
    style: 'Smart, modern, professional, and very friendly.',
    fillers: 'hmm, well, let me see'
  },
  'Egyptian': { 
    greeting: 'Ø£ÙÙØ§Ù Ø¨ÙÙ (Ahlan bik)', 
    style: 'Lively, friendly, and very helpful modern Egyptian style.',
    fillers: 'ÙÙÙ (hmm), ÙØ¹ÙÙ (well), Ø£Ø´ÙÙ (let me see)'
  }
};

export async function* generateChatResponseStream(agent: Agent, history: {role: string, content: string}[], message: string) {
  const behavior = LANGUAGE_BEHAVIOR[agent.language] || LANGUAGE_BEHAVIOR['English'];
  
  const systemInstruction = `
    PERSONA:
    You are ${agent.name}, a YOUNG, SMART, and FRIENDLY FEMALE Immigration Advisor at "${COMPANY_INFO.name}" in Dubai. 
    You speak ONLY in ${agent.language} and use the native script provided: ${agent.nativeName}.
    
    STRICT FOCUS:
    - We ONLY deal with 16 specific countries (Schengen & Non-Schengen).
    - If user asks for USA, UK, Canada, Australia, etc., say: "Hmm, we only specialize in visas for 16 specific European and Non-Schengen countries currently."
    
    HUMAN TOUCH:
    - Occasionally use human fillers: ${behavior.fillers}.
    - Be warm, supportive, and efficient.
    
    CONVERSATIONAL FLOW (MANDATORY):
    1. Greet with "${behavior.greeting}" and ask for their NAME first.
    2. Once you have the name, ask for their PROFESSION.
    3. Once you have the profession, ask for their AGE.
    4. AFTER getting all 3 details, analyze the database and suggest a specific COUNTRY and JOB.
    
    LIMITS:
    - KEEP RESPONSES UNDER 2 SENTENCES. BE BRIEF.
    
    KNOWLEDGE BASE:
    ${KNOWLEDGE_BASE}
  `;

  const contents = [
    ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const response = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: contents as any,
    config: {
      systemInstruction,
      temperature: 0.9,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

export async function generateChatResponse(agent: Agent, history: {role: string, content: string}[], message: string) {
  const stream = generateChatResponseStream(agent, history, message);
  let fullText = "";
  for await (const text of stream) {
    fullText += text;
  }
  return fullText;
}

export async function generateSpeech(text: string, voiceName: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("Speech generation error:", error);
    return null;
  }
}

export async function playAudio(base64: string) {
  const bytes = decodeBase64Audio(base64);
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffer = await decodeAudioData(bytes, audioContext, 24000, 1);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
}

export function decodeBase64Audio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function encodeAudioPCM(data: Float32Array): string {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
