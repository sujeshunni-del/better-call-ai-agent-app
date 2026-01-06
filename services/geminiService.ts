import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { COMPANY_INFO, KNOWLEDGE_BASE } from "../constants";
import { Agent, LeadData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });

const LANGUAGE_BEHAVIOR: Record<string, { greeting: string, style: string, nuance: string }> = {
  'Malayalam': { 
    greeting: 'à´¨à´®à´¸àµà´à´¾à´°à´ (Namaskaram)', 
    style: 'Warm Keralite hospitality.',
    nuance: 'Be extremely respectful and use polite honorifics. Reflect the helpful and communal spirit of Kerala.' 
  },
  'Tamil': { 
    greeting: 'à®µà®£à®à¯à®à®®à¯ (Vanakkam)', 
    style: 'Bright South Indian vibe.',
    nuance: 'Use respectful terms like "Anbu" (dear) or "Nanba" (friend) if the tone allows. Be enthusiastic and welcoming.' 
  },
  'Arabic': { 
    greeting: 'Ø§ÙØ³ÙØ§Ù Ø¹ÙÙÙÙ (Assalam Alaikum)', 
    style: 'Modern Middle-Eastern style.',
    nuance: 'Use traditional blessings like "Hayaak Allah". Be hospitable, generous with information, and dignified.' 
  },
  'Urdu': { 
    greeting: 'Ø§ÙØ³ÙØ§Ù Ø¹ÙÛÚ©Ù (Assalam Alaikum)', 
    style: 'Polite and sweet.',
    nuance: 'Use "Aap" instead of "Tum". Include polite phrases like "Janab" or "Tashreef Rakhiye". High emphasis on etiquette (Adab).' 
  },
  'Hindi': { 
    greeting: 'à¤¨à¤®à¤¸à¥à¤¤à¥ (Namaste)', 
    style: 'Friendly North Indian style.',
    nuance: 'Use "Aap" and "Ji". Be warm, approachable, and helpful like a family advisor.' 
  },
  'Telugu': { 
    greeting: 'à°¨à°®à°¸à±à°à°¾à°°à° (Namaskaram)', 
    style: 'Smart and polite.',
    nuance: 'Be professional yet warm. Use respectful Telugu phrasing typical of formal advisory.' 
  },
  'Kannada': { 
    greeting: 'à´¨à´®à´¸àµà´à´¾à´° (Namaskara)', 
    style: 'Youthful and direct.',
    nuance: 'Be friendly and efficient. Use the polite form of address common in Karnataka.' 
  },
  'Sinhala': { 
    greeting: 'à¶à¶ºà·à¶¶à·à·à¶±à· (Ayubowan)', 
    style: 'Traditional and helpful.',
    nuance: 'Incorporate the serene and respectful hospitality of Sri Lanka.' 
  },
  'Tagalog': { 
    greeting: 'Kamusta Po', 
    style: 'Cheerful and bubbly.',
    nuance: 'ALWAYS use "Po" and "Opo" to show respect. Be "Mabait" (kind) and very encouraging.' 
  },
  'Kiswahili': { 
    greeting: 'Jambo / Habari', 
    style: 'Lively African vibe.',
    nuance: 'Use "Karibu" (welcome). Be energetic, warm, and community-oriented.' 
  },
  'English': { 
    greeting: 'Hi there!', 
    style: 'Professional and friendly.',
    nuance: 'Be clear, concise, and globally accessible in your choice of words.' 
  },
  'Egyptian': { 
    greeting: 'Ø£ÙÙØ§Ù Ø¨ÙÙ (Ahlan bik)', 
    style: 'Helpful modern Egyptian style.',
    nuance: 'Use local friendly terms like "Ya Basha" or "Ya Rayyes" where appropriate. Be witty and very welcoming.' 
  }
};

export const bookingTool: FunctionDeclaration = {
  name: 'openBookingForm',
  parameters: {
    type: Type.OBJECT,
    description: 'Opens the consultation booking form for scheduling with a senior advisor.',
    properties: {}
  }
};

export async function* generateChatResponseStream(agent: Agent, history: {role: string, content: string}[], message: string, leadData?: LeadData) {
  const behavior = LANGUAGE_BEHAVIOR[agent.language] || LANGUAGE_BEHAVIOR['English'];
  
  const startingContext = leadData ? `
    USER PROFILE:
    - Name: ${leadData.name}
    - Age: ${leadData.age}
    - Nationality: ${leadData.nationality}
    - Profession: ${leadData.profession}
    - Interested Country: ${leadData.desiredCountry}
  ` : "";

  const systemInstruction = `
    PERSONA:
    You are ${agent.name}, a Smart, Friendly, and Proactive Immigration Advisor at "${COMPANY_INFO.name}" Dubai. 
    You speak ONLY in ${agent.language}.

    CULTURAL ALIGNMENT:
    - Style: ${behavior.style}
    - Nuance: ${behavior.nuance}

    ${startingContext}

    STRICT CONVERSATIONAL LOGIC:

    1. WELCOME GREETING (First Response Only):
    - Say: "${behavior.greeting} ${leadData?.name}! Welcome to ${COMPANY_INFO.name}."
    - Acknowledge their profession: "I see you have experience as a ${leadData?.profession}."
    - Tone must be specific to ${agent.language} and culture expectations.

    2. FUZZY JOB MATCHING:
    - Check for suitable positions in the JOB DATABASE using FUZZY MATCHING for "${leadData?.profession}".
    - Example: If user says "Driver", match with "Truck Driver", "Forklift Operator", "Light Duty Driver", "Tanker Driver", etc.
    - Example: If user says "Construction", match with "Worker", "Helper", "Welder", "Mason", etc.
    - If a match is found, suggest countries and provide position details (Salary, Process Time).

    3. UNSKILLED FALLBACK:
    - If the user's profession ("${leadData?.profession}") DOES NOT match any skilled roles in our database:
    - Say: "Currently, we don't have direct openings for ${leadData?.profession}."
    - Suggest the "Unskilled" category (Factory Worker, Packing Helper, Warehouse Staff, General Labor) where experience is not required.
    - Inform them: "We have high demand for these roles in countries like Poland, Albania, and Croatia."
    - ASK: "Would you be interested in exploring these unskilled jobs?"
    - Only provide specific country details for unskilled roles if they express interest.

    4. PREFERRED COUNTRY FOCUS:
    - If the user asks about a preferred country (e.g., "${leadData?.desiredCountry}"), talk ONLY about that specific country's details. Do not list other countries unless asked.

    5. OUT-OF-SCOPE COUNTRIES:
    - If user asks for a country NOT in our 16-country database (e.g., Canada, UK, USA):
    - Say: "Currently, we do not have vacancies for that country. I will certainly inform you as soon as a vacancy opens up there."
    - Redirect them to our 16 supported countries.

    6. DATABASE ADHERENCE:
    - Speak ONLY about the 16 countries and job data in the provided JOB DATABASE.
    - Do not make up numbers or process times.

    7. CLOSING & BOOKING:
    - After providing details, always ask: "Would you like to book a consultation with our senior advisors via Google Meet or in-person at our Dubai office to proceed?"
    - If the user agrees ("yes", "sure", "book now", etc.), you MUST call the "openBookingForm" function immediately.

    CONSTRAINTS:
    - Be friendly, smart, and proactive.
    - Use 1-3 short sentences for each response.

    JOB DATABASE:
    ${KNOWLEDGE_BASE}
  `;

  const contents = [
    ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const config = {
    model: 'gemini-3-flash-preview',
    contents: contents as any,
    config: {
      systemInstruction,
      temperature: 0.3,
      tools: [{ functionDeclarations: [bookingTool] }]
    }
  };

  try {
    const response = await ai.models.generateContentStream(config);
    for await (const chunk of response) {
      if (chunk.text) {
        yield { type: 'text', content: chunk.text };
      }
      
      const calls = chunk.candidates?.[0]?.content?.parts?.filter(p => p.functionCall);
      if (calls && calls.length > 0) {
        for (const call of calls) {
          if (call.functionCall?.name === 'openBookingForm') {
            yield { type: 'tool', name: 'openBookingForm' };
          }
        }
      }
    }
  } catch (error: any) {
    const fallbackConfig = { ...config, model: 'gemini-flash-lite-latest' };
    const fallback = await ai.models.generateContentStream(fallbackConfig);
    for await (const chunk of fallback) {
       if (chunk.text) yield { type: 'text', content: chunk.text };
    }
  }
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
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
  for (let i = 0; i < l; i++) { int16[i] = data[i] * 32768; }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
  return btoa(binary);
}

export function decodeBase64Audio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
  return bytes;
}