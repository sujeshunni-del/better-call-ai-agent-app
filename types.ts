
export enum LanguageCode {
  MALAYALAM = 'ml',
  TAMIL = 'ta',
  TELUGU = 'te',
  HINDI = 'hi',
  KANNADA = 'kn',
  URDU = 'ur',
  ARABIC = 'ar',
  EGYPTIAN = 'ar-EG',
  TAGALOG = 'tl',
  SINHALA = 'si',
  SWAHILI = 'sw',
  ENGLISH = 'en'
}

export type ConsultationMode = 'Google Meet' | 'In-person Office';

export interface Advisor {
  id: string;
  name: string;
  calApiKey: string;
  initials: string;
  meetSlug: string;
  officeSlug: string;
  languages: string[];
  phone: string;
}

export interface Agent {
  id: string;
  name: string;
  nativeName: string;
  language: string;
  flag: string;
  langCode: LanguageCode;
  voiceName: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface JobData {
  country: string;
  region: 'Schengen' | 'Non-Schengen';
  category: string;
  position: string;
  experience: string;
  salary: string;
  processTime: string;
  visaCost: string;
  paymentTerms: string;
  ageLimit: string;
}

export interface LeadData {
  name: string;
  age: string;
  profession: string;
  phone: string;
  email: string;
  desiredCountry: string;
  nationality: string;
}
