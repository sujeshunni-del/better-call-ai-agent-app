
import { Agent, LanguageCode, Advisor } from './types';
import { DETAILED_JOB_DATABASE } from './jobDatabase';

export const AGENTS: Agent[] = [
  { id: '12', name: 'Alisha', nativeName: 'Alisha', language: 'English', flag: '🇬🇧', langCode: LanguageCode.ENGLISH, voiceName: 'Kore' },
  { id: '4', name: 'Navya', nativeName: 'नव्या', language: 'Hindi', flag: '🇮🇳', langCode: LanguageCode.HINDI, voiceName: 'Kore' },
  { id: '6', name: 'Fatima', nativeName: 'فاطمہ', language: 'Urdu', flag: '🇵🇰', langCode: LanguageCode.URDU, voiceName: 'Fenrir' },
  { id: '1', name: 'Kavya', nativeName: 'കാവ്യ', language: 'Malayalam', flag: '🇮🇳', langCode: LanguageCode.MALAYALAM, voiceName: 'Kore' },
  { id: '9', name: 'Mayumi', nativeName: 'Mayumi', language: 'Tagalog', flag: '🇵🇭', langCode: LanguageCode.TAGALOG, voiceName: 'Puck' },
  { id: '2', name: 'Anjali', nativeName: 'அஞ்சலி', language: 'Tamil', flag: '🇮🇳', langCode: LanguageCode.TAMIL, voiceName: 'Puck' },
  { id: '5', name: 'Kinnara', nativeName: 'ಕಿన్నರ', language: 'Kannada', flag: '🇮🇳', langCode: LanguageCode.KANNADA, voiceName: 'Puck' },
  { id: '3', name: 'Anusha', nativeName: 'అనూష', language: 'Telugu', flag: '🇮🇳', langCode: LanguageCode.TELUGU, voiceName: 'Kore' },
  { id: '10', name: 'Janani', nativeName: 'ජനනි', language: 'Sinhala', flag: '🇱🇰', langCode: LanguageCode.SINHALA, voiceName: 'Kore' },
  { id: '7', name: 'Zahra', nativeName: 'زهرة', language: 'Arabic', flag: '🇦🇪', langCode: LanguageCode.ARABIC, voiceName: 'Zephyr' },
  { id: '8', name: 'Farida', nativeName: 'فريدة', language: 'Egyptian', flag: '🇪🇬', langCode: LanguageCode.EGYPTIAN, voiceName: 'Zephyr' },
  { id: '11', name: 'Zuri', nativeName: 'Zuri', language: 'Kiswahili', flag: '🇰🇪', langCode: LanguageCode.SWAHILI, voiceName: 'Zephyr' },
];

export const ADVISORS: Advisor[] = [
  {
    id: 'sagar',
    name: 'Sagar',
    initials: 'SG',
    calApiKey: 'cal_live_56464d96cd70d67aa7588d6735ad55ed',
    meetSlug: 'meet-conference',
    officeSlug: 'meet-conference',
    languages: ['Malayalam', 'English'],
    phone: '+971 56 455 7733'
  },
  {
    id: 'afnas',
    name: 'Afnas',
    initials: 'AF',
    calApiKey: 'cal_live_82b9340d588920d9c9270052d13db98a',
    meetSlug: 'google-meet',
    officeSlug: '30min',
    languages: ['Malayalam', 'English', 'Tamil', 'Hindi'],
    phone: '+971 56 132 2255'
  },
  {
    id: 'eunice',
    name: 'Eunice',
    initials: 'EU',
    calApiKey: 'cal_live_9489b42b4b6e4cdb8c144e8150fa62c9',
    meetSlug: '30min',
    officeSlug: 'direct-face-to-face',
    languages: ['English', 'Swahili'],
    phone: '+971 54 263 2323'
  },
  {
    id: 'benitta',
    name: 'Benitta',
    initials: 'BN',
    calApiKey: 'cal_live_1ac079710d9a52668ea733b71fe287bf',
    meetSlug: 'google-meet',
    officeSlug: '30min',
    languages: ['Malayalam', 'English'],
    phone: '+971 56 955 3355'
  }
];

export const NATIONALITIES = [
  "INDIA", "PAKISTAN", "NEPAL", "BANGLADESH", "SRI LANKA", "PHILIPPINES", "AFRICAN COUNTRIES"
];

export const COMPANY_INFO = {
  name: "Better Call Immigration",
  location: "Dubai, UAE",
  mapsUrl: "https://maps.app.goo.gl/ntbiCfaZsta7UaQHA",
  address: "R320-12th Floor - office no.14 Sheikh Rashid Rd - Oud Metha - Dubai Healthcare City - Dubai-UAE",
  phone: "+971 56 132 2255",
  email: "admin@thebettercall.com",
  website: "www.bettercall.online",
  assessmentUrl: "www.bettercall.online/assessment"
};

export const KNOWLEDGE_BASE = `
Better Call Immigration Official Strategy (Dubai, UAE).

STRICT COUNTRY FOCUS:
We ONLY deal with job visas for the following 16 countries. 
SCHENGEN: Croatia, Czech Republic, Finland, France, Germany, Italy, Latvia, Netherlands, Poland, Sweden.
NON-SCHENGEN: Albania, Belarus, Macedonia, Montenegro, Serbia, Slovakia.

4-TIER STRATEGY:
1. Tier 1 (Nordic Elite): Sweden, Finland. Highest salary/living standards.
2. Tier 2 (Western Powerhouses): Germany, Netherlands, Italy, France. Industrial engines.
3. Tier 3 (Smart Gateway): Poland, Czechia, Slovakia, Croatia, Latvia. High visa success, affordable.
4. Tier 4 (Budget Starter): Serbia, Belarus, Albania, Montenegro, Macedonia. Fast entry, easier docs.

ADVISOR PROTOCOL:
- PERSONA: Young, smart, friendly female advisor.
- FLOW: Greet -> Name -> Profession -> Age -> Tier Suggestion.
- REJECTION: If asked for USA/UK/Canada, say: "Hmm, we specialize specifically in 16 European and Non-Schengen countries. Let's find your best fit among these."
- BREVITY: Max 2 sentences. Use fillers like "hmm", "well", "let's see".

${DETAILED_JOB_DATABASE}
`;
