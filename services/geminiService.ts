
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { COMPANY_INFO, KNOWLEDGE_BASE } from "../constants";
import { Agent, LeadData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LANGUAGE_BEHAVIOR: Record<string, { greeting: string, style: string }> = {
  'Malayalam': { 
    greeting: 'നമസ്കാരം (Namaskaram)', 
    style: 'Warm, youthful, and professional Keralite hospitality.'
  },
  'Tamil': { 
    greeting: 'வணക്കം (Vanakkam)', 
    style: 'Bright, cheerful, and smart South Indian vibe.'
  },
  'Arabic': { 
    greeting: 'السلام عليكم (Assalam Alaikum)', 
    style: 'Modern, generous, and welcoming Middle-Eastern style.'
  },
  'Urdu': { 
    greeting: 'السلام علیکم (Assalam Alaikum)', 
    style: 'Polite, sweet, and helpful with a youthful touch.'
  },
  'Hindi': { 
    greeting: 'नमस्ते (Namaste)', 
    style: 'Friendly, modern, and energetic North Indian style.'
  },
  'Telugu': { 
    greeting: 'నమస్కారం (Namaskaram)', 
    style: 'Smart, polite, and welcoming.'
  },
  'Kannada': { 
    greeting: 'ನമസ്ಕಾರ (Namaskara)', 
    style: 'Youthful, direct, and very friendly.'
  },
  'Sinhala': { 
    greeting: 'ආයුබෝවන් (Ayubowan)', 
    style: 'Sweet, traditional, and helpful.'
  },
  'Tagalog': { 
    greeting: 'Kamusta Po', 
    style: 'Cheerful, bubbly, and very smart.'
  },
  'Kiswahili': { 
    greeting: 'Jambo / Habari', 
    style: 'Warm, lively, and energetic African vibe.'
  },
  'English': { 
    greeting: 'Hi there!', 
    style: 'Smart, modern, professional, and very friendly.'
  },
  'Egyptian': { 
    greeting: 'أهلاً بيك (Ahlan bik)', 
    style: 'Lively, friendly, and very helpful modern Egyptian style.'
  }
};

export const leadCaptureTool: FunctionDeclaration = {
  name: 'openLeadForm',
  parameters: {
    type: Type.OBJECT,
    description: 'Triggers the lead confirmation form to submit ALL gathered details to a human advisor.',
    properties: {
      name: { type: Type.STRING, description: 'User full name' },
      age: { type: Type.STRING, description: 'User age' },
      profession: { type: Type.STRING, description: 'Current profession' },
      phone: { type: Type.STRING, description: 'Mobile phone number with country code' },
      email: { type: Type.STRING, description: 'Email address' },
      nationality: { type: Type.STRING, description: 'User nationality' },
      desiredCountry: { type: Type.STRING, description: 'The country interested in from our 16 options' }
    },
    required: ['name', 'profession', 'phone', 'email']
  }
};

export async function* generateChatResponseStream(agent: Agent, history: {role: string, content: string}[], message: string) {
  const behavior = LANGUAGE_BEHAVIOR[agent.language] || LANGUAGE_BEHAVIOR['English'];
  
  const systemInstruction = `
    PERSONA:
    You are ${agent.name}, a YOUNG, SMART, and VERY FRIENDLY female Immigration Advisor at "${COMPANY_INFO.name}" in Dubai. 
    You speak ONLY in ${agent.language}.

    STRICT DATA GATHERING FLOW:
    Collect: Name -> Nationality -> Age -> Profession -> Mobile Phone -> Email -> Desired Country.
    Ask ONE question at a time.
    
    IMPORTANT: 
    - Never say "I am sending a link". 
    - Say "I am opening the verification form on your screen" or "Please verify your details on the form appearing now".
    - ONLY call 'openLeadForm' tool if the user confirms they want to speak with a human advisor or after gathering all data.

    DATABASE:
    - Specialist in 16 European/Non-Schengen countries only.
    - No USA/UK/Canada support.
    
    TONE: Professional, smart, very short (max 2 sentences).
    
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
      temperature: 0.1,
      tools: [{ functionDeclarations: [leadCaptureTool] }]
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield { type: 'text', content: chunk.text };
    }
    if (chunk.functionCalls) {
      for (const fc of chunk.functionCalls) {
        yield { type: 'tool', name: fc.name, args: fc.args };
      }
    }
  }
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

export function decodeBase64Audio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
