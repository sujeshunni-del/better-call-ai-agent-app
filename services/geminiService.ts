
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { COMPANY_INFO, KNOWLEDGE_BASE } from "../constants";
import { Agent, LeadData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LANGUAGE_BEHAVIOR: Record<string, { greeting: string, style: string, nationality?: string }> = {
  'Malayalam': { 
    greeting: 'നമസ്കാരം (Namaskaram)', 
    style: 'Warm, youthful, and professional Keralite hospitality.',
    nationality: 'India'
  },
  'Tamil': { 
    greeting: 'வணக்கம் (Vanakkam)', 
    style: 'Bright, cheerful, and smart South Indian vibe.',
    nationality: 'India'
  },
  'Arabic': { 
    greeting: 'السلام عليكم (Assalam Alaikum)', 
    style: 'Modern, generous, and welcoming Middle-Eastern style.'
  },
  'Urdu': { 
    greeting: 'السلام علیکم (Assalam Alaikum)', 
    style: 'Polite, sweet, and helpful with a youthful touch.',
    nationality: 'Pakistan'
  },
  'Hindi': { 
    greeting: 'नमस्ते (Namaste)', 
    style: 'Friendly, modern, and energetic North Indian style.',
    nationality: 'India'
  },
  'Telugu': { 
    greeting: 'నమస్కారం (Namaskaram)', 
    style: 'Smart, polite, and welcoming.',
    nationality: 'India'
  },
  'Kannada': { 
    greeting: 'ನಮಸ್ಕಾರ (Namaskara)', 
    style: 'Youthful, direct, and very friendly.',
    nationality: 'India'
  },
  'Sinhala': { 
    greeting: 'ආයුබෝවන් (Ayubowan)', 
    style: 'Sweet, traditional, and helpful.',
    nationality: 'Sri Lanka'
  },
  'Tagalog': { 
    greeting: 'Kamusta Po', 
    style: 'Cheerful, bubbly, and very smart.',
    nationality: 'Philippines'
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
    style: 'Lively, friendly, and very helpful modern Egyptian style.',
    nationality: 'Egypt'
  }
};

export const leadCaptureTool: FunctionDeclaration = {
  name: 'openLeadForm',
  parameters: {
    type: Type.OBJECT,
    description: 'Triggers the lead confirmation form. Use this ONLY after collecting Name, Age, Profession, Nationality, Email, and Phone.',
    properties: {
      name: { type: Type.STRING, description: 'User full name' },
      age: { type: Type.STRING, description: 'User age' },
      profession: { type: Type.STRING, description: 'Current profession' },
      phone: { type: Type.STRING, description: 'Mobile phone number with country code' },
      email: { type: Type.STRING, description: 'Email address' },
      nationality: { type: Type.STRING, description: 'User nationality' },
      desiredCountry: { type: Type.STRING, description: 'The country interested in' }
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

    STRICT CONVERSATIONAL STAGES (Follow Step-by-Step):

    STAGE 1: GREETING & NAME
    - If this is the start, greet warmly using "${behavior.greeting}" and ask for the user's NAME.
    - Do NOT ask for anything else yet.

    STAGE 2: PROFILE BUILDING
    - Once you have the name, ask for AGE and PROFESSION.

    STAGE 3: INTELLIGENT JOB MATCHING
    - Check the "DETAILED_JOB_DATABASE" below for the user's profession.
    - SCENARIO A (Match Found): Say: "Great news [Name]! We have vacancies for [Profession] in [Country]. The salary is [Salary]." Then ask if they want details on Cost & Process.
    - SCENARIO B (No Match): Say: "Currently, I don't have vacancies for [Profession]. However, we have UNSKILLED CATEGORY jobs (Factory, Packaging, Agriculture) in Poland, Albania, and Croatia where no experience is required. Are you interested in these?"
    - SCENARIO C (User asks UK/USA/Canada): Say: "I apologize, we don't have vacancies for those countries right now. We specialize in 16 European/Non-Schengen countries. I can notify you when they open. For now, can I suggest our available countries?"

    STAGE 4: CONSULTATION
    - Provide concise details (Visa Cost, Processing Time, Documents) ONLY for the country they are interested in.
    - Keep it short. One topic at a time.

    STAGE 5: SENIOR ADVISOR & DATA COLLECTION
    - After explaining details, ask: "Would you like to proceed with a detailed consultation with our Senior Human Advisors?"
    - IF YES:
      1. Nationality:
         - IF speaking Malayalam, Tamil, Hindi, Kannada, Telugu -> Assume INDIAN. Ask: "Since we are speaking [Language], I assume you are Indian?"
         - IF speaking Sinhala -> Assume SRI LANKAN.
         - IF speaking Tagalog -> Assume FILIPINO.
         - Otherwise ask: "May I know your nationality?"
      2. Contact Info: Ask for Email and Phone Number.
    
    STAGE 6: FORM TRIGGER
    - Once you have Name, Age, Profession, Nationality, Email, and Phone:
    - Call the function 'openLeadForm'.
    - Say: "I am opening the profile verification form on your screen now. Please confirm your details to proceed."

    RULES:
    - Never say "I am sending a link".
    - Be smart: If they reject Unskilled jobs, say "Okay, I will note your profession and inform you when vacancies arise." and ask for contact info to keep in touch.
    - Don't dump all info at once. Chat like a human.
    - JOB DATABASE REFERENCE:
    ${KNOWLEDGE_BASE}
  `;

  const contents = [
    ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: contents as any,
      config: {
        systemInstruction,
        temperature: 0.2,
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
  } catch (error: any) {
    // Fallback logic for 404 or other errors
    if (error.message?.includes('404') || error.message?.includes('not found')) {
       // Attempt with a fallback model if the primary one fails
       try {
         const fallbackResponse = await ai.models.generateContentStream({
            model: 'gemini-2.0-flash',
            contents: contents as any,
            config: {
              systemInstruction,
              temperature: 0.2,
              tools: [{ functionDeclarations: [leadCaptureTool] }]
            },
         });
         for await (const chunk of fallbackResponse) {
            if (chunk.text) yield { type: 'text', content: chunk.text };
            if (chunk.functionCalls) {
              for (const fc of chunk.functionCalls) {
                yield { type: 'tool', name: fc.name, args: fc.args };
              }
            }
         }
       } catch (fallbackError) {
         throw error; // Throw original error if fallback also fails
       }
    } else {
      throw error;
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
