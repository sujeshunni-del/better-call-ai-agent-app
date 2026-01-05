
import { GoogleGenAI, Modality } from "@google/genai";
import { COMPANY_INFO, KNOWLEDGE_BASE } from "../constants";
import { Agent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LANGUAGE_BEHAVIOR: Record<string, { greeting: string, style: string, fillers: string }> = {
  'Malayalam': { 
    greeting: 'നമസ്കാരം (Namaskaram)', 
    style: 'Warm, youthful, and professional Keralite hospitality.',
    fillers: 'മ്മ് (hmm), പിന്നെ (well), നോക്കട്ടെ (let me see)'
  },
  'Tamil': { 
    greeting: 'வணக்கம் (Vanakkam)', 
    style: 'Bright, cheerful, and smart South Indian vibe.',
    fillers: 'ம்ம் (hmm), சரி (well), பாக்கலாம் (let me see)'
  },
  'Arabic': { 
    greeting: 'السلام عليكم (Assalam Alaikum)', 
    style: 'Modern, generous, and welcoming Middle-Eastern style.',
    fillers: 'ممم (hmm), طيب (well), أشوف (let me see)'
  },
  'Urdu': { 
    greeting: 'السلام علیکم (Assalam Alaikum)', 
    style: 'Polite, sweet, and helpful with a youthful touch.',
    fillers: 'ہوں (hmm), تو (well), دیکھنے دیں (let me see)'
  },
  'Hindi': { 
    greeting: 'नमस्ते (Namaste)', 
    style: 'Friendly, modern, and energetic North Indian style.',
    fillers: 'हम्म (hmm), तो (well), देखते हैं (let me see)'
  },
  'Telugu': { 
    greeting: 'నమస్కారం (Namaskaram)', 
    style: 'Smart, polite, and welcoming.',
    fillers: 'మ్మ్ (hmm), సరే (well), చూద్దాం (let me see)'
  },
  'Kannada': { 
    greeting: 'ನಮಸ್ಕಾರ (Namaskara)', 
    style: 'Youthful, direct, and very friendly.',
    fillers: 'ಹೂಂ (hmm), ಮತ್ತೆ (well), ನೋಡೋಣ (let me see)'
  },
  'Sinhala': { 
    greeting: 'ආයුබෝවන් (Ayubowan)', 
    style: 'Sweet, traditional, and helpful.',
    fillers: 'ම්ම් (hmm), ඉතින් (well), බලමු (let me see)'
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
    greeting: 'أهلاً بيك (Ahlan bik)', 
    style: 'Lively, friendly, and very helpful modern Egyptian style.',
    fillers: 'ممم (hmm), يعني (well), أشوف (let me see)'
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
