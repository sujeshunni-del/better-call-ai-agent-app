
import React, { useState, useRef, useEffect } from 'react';
import { AGENTS, COMPANY_INFO } from './constants';
import { Agent, Message, LeadData } from './types';
import { generateChatResponseStream, encodeAudioPCM, decodeAudioData, decodeBase64Audio } from './services/geminiService';
import { GoogleGenAI, Modality } from '@google/genai';
import BookingForm from './components/BookingForm';
import LeadForm from './components/LeadForm';
import { 
  Send, 
  Mic, 
  ChevronLeft,
  MessageCircle,
  ArrowRight,
  Calendar,
  ShieldCheck,
  Globe,
  Keyboard,
  Mic2,
  Loader2,
  AlertCircle,
  PhoneOff,
  Paperclip,
  Smile,
  CheckCheck
} from 'lucide-react';

type AppView = 'landing' | 'agent-selection' | 'mode-selection' | 'chat';

const LOGO_URL = "https://raw.githubusercontent.com/sujeshunni-del/bettercall/e79275bdfafe1a36a0b49469c44187120b97e4ba/Bettercall%20Logo%20SVG%2003.svg";

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLiveVoice, setIsLiveVoice] = useState(false);
  const [isConnectingVoice, setIsConnectingVoice] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showBooking, setShowBooking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [userProfileData, setUserProfileData] = useState<LeadData | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentOutputTranscriptionRef = useRef('');
  const micStreamRef = useRef<MediaStream | null>(null);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  useEffect(() => {
    if (view === 'chat' && !isLiveVoice && !isTyping) {
      inputRef.current?.focus();
    }
  }, [view, isLiveVoice, messages.length, isTyping]);

  useEffect(() => {
    if (selectedAgent && messages.length === 0 && view === 'chat' && userProfileData) {
      if (!isLiveVoice) {
        const triggerGreeting = async () => {
          setIsTyping(true);
          const assistantId = 'greeting-id';
          const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date() };
          setMessages([assistantMsg]);

          try {
            const stream = generateChatResponseStream(selectedAgent, [], "Hello", userProfileData);
            let fullContent = "";
            for await (const chunk of stream) {
              if (chunk.type === 'text') {
                fullContent += chunk.content;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
              } else if (chunk.type === 'tool' && chunk.name === 'openBookingForm') {
                setShowBooking(true);
              }
            }
          } catch (e: any) {
            console.error(e);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Hello ${userProfileData.name}! I am ${selectedAgent.name}. I see you are a ${userProfileData.profession}. How can I help you today?` } : m));
          } finally {
            setIsTyping(false);
          }
        };
        triggerGreeting();
      } else {
        startLiveVoice();
      }
    }
  }, [selectedAgent, view, isLiveVoice, userProfileData]);

  const startLiveVoice = async () => {
    if (!selectedAgent || isConnectingVoice || !userProfileData) return;
    setIsConnectingVoice(true);
    setVoiceError(null);
    setLiveTranscript('');
    currentOutputTranscriptionRef.current = '';
    
    try {
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = outCtx;
      inputAudioContextRef.current = inCtx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsConnectingVoice(false);
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(1024, 1, 1); 
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encodeAudioPCM(inputData), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (msg: any) => {
            if (msg.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += msg.serverContent.outputTranscription.text;
              setLiveTranscript(currentOutputTranscriptionRef.current);
            }
            const parts = msg.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data && audioContextRef.current) {
                  const audioBuffer = await decodeAudioData(decodeBase64Audio(part.inlineData.data), audioContextRef.current, 24000, 1);
                  const source = audioContextRef.current.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(audioContextRef.current.destination);
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  activeSourcesRef.current.add(source);
                }
              }
            }
          },
          onclose: () => stopLiveVoice(),
          onerror: () => setVoiceError("Connection issue.")
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedAgent.voiceName } } },
          systemInstruction: `You are ${selectedAgent.name}. Speak ${selectedAgent.language}. User: ${userProfileData.name}, ${userProfileData.age}, ${userProfileData.nationality}, ${userProfileData.profession}. User is fully verified with email and phone. Jump straight to matching jobs from the database.`
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err: any) {
      setVoiceError("Mic connection failed.");
      setIsConnectingVoice(false);
    }
  };

  const stopLiveVoice = () => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    setIsLiveVoice(false);
    setView('mode-selection');
  };

  const handleSend = async (text: string = input) => {
    const trimmed = text.trim();
    if (!trimmed || !selectedAgent || !userProfileData) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: trimmed, timestamp: new Date() }]);
    setInput('');
    setIsTyping(true);
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
    
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const stream = generateChatResponseStream(selectedAgent, history, trimmed, userProfileData);
      let fullContent = "";
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
        } else if (chunk.type === 'tool' && chunk.name === 'openBookingForm') {
          setShowBooking(true);
        }
      }
    } catch (e: any) { 
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: "Connection issue. Please try again." } : m));
    } finally { setIsTyping(false); }
  };

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowEntryForm(true);
  };

  const handleEntrySuccess = (data: LeadData) => {
    setUserProfileData(data);
    setShowEntryForm(false);
    setView('mode-selection');
  };

  const renderLanding = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#fdfdff] font-jakarta overflow-hidden">
      <div className="flex-1 overflow-y-auto ios-scroll">
        <header className="px-6 pt-16 pb-12 bg-white border-b border-slate-50 text-center relative shrink-0">
          <div className="w-24 h-24 flex items-center justify-center mb-8 mx-auto animate-in zoom-in duration-700">
            <div className="p-2 bg-white rounded-[2rem] shadow-2xl vibrant-shadow">
              <img src={LOGO_URL} alt="Logo" className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-[900] tracking-tight text-slate-900 leading-tight uppercase mb-4">Better Call<br/><span className="gradient-text">Immigration</span></h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
            <ShieldCheck size={10} className="text-[#075e54]" />
            <p className="text-[#075e54] text-[8px] font-black uppercase tracking-[0.3em]">Official Advisor Portal</p>
          </div>
        </header>
        <div className="px-6 py-10 flex flex-col gap-5 max-w-sm mx-auto w-full relative z-20">
          <button onClick={() => setView('agent-selection')} className="group w-full flex items-center gap-4 p-5 bg-gradient-to-br from-[#075e54] to-[#128c7e] rounded-[2rem] shadow-xl active:scale-[0.97] transition-all text-left">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white shrink-0"><MessageCircle size={24} /></div>
            <div className="flex-1"><h3 className="text-lg font-black text-white uppercase tracking-tight leading-none mb-1">AI Immigration Agent</h3><p className="text-[8px] text-emerald-50 font-bold uppercase tracking-widest opacity-80">Profile Verification</p></div>
            <ArrowRight className="text-white/40" size={20} />
          </button>
          <button onClick={() => setShowBooking(true)} className="group w-full flex items-center gap-4 p-5 bg-slate-900 rounded-[2rem] shadow-xl active:scale-[0.97] transition-all text-left">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white shrink-0"><Calendar size={24} /></div>
            <div className="flex-1"><h3 className="text-lg font-black text-white uppercase tracking-tight leading-none mb-1">Book Now</h3><p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest opacity-80">Human Expert Consultation</p></div>
            <ArrowRight className="text-white/20" size={20} />
          </button>
        </div>
      </div>
      <footer className="p-8 text-center border-t border-slate-50 opacity-40 shrink-0 safe-bottom">
        <div className="flex items-center justify-center gap-2"><Globe size={10} className="text-[#075e54]" /><p className="text-[7px] font-black text-slate-900 uppercase tracking-[0.5em]">{COMPANY_INFO.name}</p></div>
      </footer>
    </div>
  );

  const renderAgentSelection = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#fdfdff] overflow-hidden">
      <header className="px-6 pt-16 pb-6 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-[100] shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('landing')} className="p-2 -ml-2 text-slate-950 active:scale-90 transition-transform"><ChevronLeft size={28} /></button>
          <div><h2 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none">Advisor</h2><p className="text-[8px] font-black uppercase text-emerald-600 tracking-widest mt-1">Select Language</p></div>
        </div>
      </header>
      <div className="flex-1 px-4 pt-6 pb-24 overflow-y-auto ios-scroll">
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          {AGENTS.map((agent) => (
            <button key={agent.id} onClick={() => handleAgentSelect(agent)} className="group flex items-center gap-3 p-4 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-[#075e54] active:scale-[0.96] transition-all text-left">
              <div className="w-11 h-11 flex items-center justify-center text-2xl bg-slate-50 rounded-2xl group-hover:scale-110 shrink-0 transition-transform">{agent.flag}</div>
              <div className="min-w-0 flex-1"><h3 className="text-[12px] font-black text-slate-900 truncate uppercase">{agent.nativeName}</h3><p className="text-[8px] font-black uppercase text-emerald-600 tracking-widest truncate opacity-60">{agent.language}</p></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderModeSelection = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#fdfdff] font-jakarta px-6 overflow-hidden">
      <div className="flex-1 flex flex-col justify-center items-center">
        <div className="text-center mb-10">
          <div className="text-7xl mb-6">{selectedAgent?.flag}</div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-2">Connect with {selectedAgent?.nativeName}</h2>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em]">Choose your preference</p>
        </div>
        <div className="w-full max-sm:px-4 max-w-sm space-y-4">
          <button onClick={() => { setIsLiveVoice(false); setView('chat'); }} className="group w-full flex items-center justify-between p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm hover:border-[#075e54] active:scale-95 transition-all text-left">
            <div className="flex items-center gap-5"><div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#075e54] group-hover:bg-[#075e54] group-hover:text-white transition-colors"><Keyboard size={24} /></div><div><p className="text-base font-black text-slate-900 uppercase">Text Chat</p><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Instant Messaging</p></div></div>
            <ArrowRight className="text-slate-400" size={18} />
          </button>
          <button onClick={() => { setIsLiveVoice(true); setView('chat'); }} className="group w-full flex items-center justify-between p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm hover:border-[#075e54] active:scale-95 transition-all text-left">
            <div className="flex items-center gap-5"><div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#075e54] group-hover:bg-[#075e54] group-hover:text-white transition-colors"><Mic2 size={24} /></div><div><p className="text-base font-black text-slate-900 uppercase">Live Voice</p><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real-time Audio</p></div></div>
            <ArrowRight className="text-slate-400" size={18} />
          </button>
        </div>
      </div>
      <button onClick={() => setView('agent-selection')} className="mb-12 text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] flex items-center gap-2 self-center active:text-[#075e54] transition-colors"><ChevronLeft size={16} /> Back to agents</button>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#efe7de] overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"></div>
      
      <header className="px-3 pt-6 pb-2 bg-[#075e54] text-white flex items-center justify-between sticky top-0 z-[100] shrink-0 shadow-md">
        <div className="flex items-center gap-1">
          <button onClick={() => { if (isLiveVoice) stopLiveVoice(); setView('mode-selection'); setMessages([]); }} className="p-1 -ml-1 active:scale-90 transition-transform"><ChevronLeft size={24} /></button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-md">{selectedAgent?.flag}</div>
            <div className="min-w-0"><h1 className="text-[14px] font-bold truncate leading-tight">{selectedAgent?.nativeName}</h1><p className="text-[8px] text-emerald-100/80 font-medium leading-none">Online</p></div>
          </div>
        </div>
        <button onClick={() => setShowBooking(true)} className="p-2 opacity-90"><Calendar size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-1 ios-scroll pb-28 relative z-10 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
            <div className={`relative max-w-[85%] px-2.5 py-1 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-[#dcf8c6]' : 'bg-white'}`}>
              <div className="text-[14px] leading-[1.35] pb-1 pr-10 text-slate-900 font-medium">{msg.content}</div>
              <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-50"><span className="text-[8px] font-medium text-slate-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>{msg.role === 'user' && <CheckCheck size={10} className="text-[#34b7f1]" />}</div>
              <div className={`absolute top-0 w-3 h-3 ${msg.role === 'user' ? 'right-[-8px] bg-[#dcf8c6] [clip-path:polygon(0%_0%,0%_100%,100%_0%)]' : 'left-[-8px] bg-white [clip-path:polygon(100%_0%,100%_100%,0%_0%)]'}`}></div>
            </div>
          </div>
        ))}
        {isTyping && !isLiveVoice && (
          <div className="flex justify-start">
            <div className="bg-white px-2 py-1.5 rounded-lg rounded-tl-none shadow-sm flex items-center gap-1">
              <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-4" />
      </main>

      {!isLiveVoice && (
        <footer className="px-2 pt-2 pb-5 bg-transparent sticky bottom-0 z-[110] shrink-0 safe-bottom">
          <div className="flex items-end gap-2 max-w-xl mx-auto">
            <div className="flex-1 bg-white rounded-2xl flex items-end px-1.5 py-1 shadow-sm border border-black/5">
              <button className="p-2 text-[#919191]"><Smile size={20} /></button>
              <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Type a message" className="flex-1 bg-transparent border-none outline-none px-2 py-2 text-slate-900 text-[14px] max-h-32 resize-none leading-tight" style={{ height: 'auto' }} />
              <button className="p-2 text-[#919191]"><Paperclip size={20} className="-rotate-45" /></button>
            </div>
            <button onClick={() => handleSend()} disabled={!input.trim() && !isTyping} className="w-10 h-10 rounded-full flex items-center justify-center bg-[#075e54] text-white transition-all shadow-md shrink-0 active:scale-90">{!input.trim() ? <Mic size={18} /> : <Send size={18} className="ml-0.5" />}</button>
          </div>
        </footer>
      )}

      {isLiveVoice && (
        <div className="fixed inset-0 z-[1000] bg-[#075e54] flex flex-col items-center pt-20 px-6 h-[100dvh]">
          <div className="text-center mb-8">
            <div className="text-[80px] mb-4">{selectedAgent?.flag}</div>
            <h2 className="text-2xl font-bold text-white uppercase">{selectedAgent?.nativeName}</h2>
            <div className="bg-emerald-500/20 text-emerald-100 text-[10px] px-3 py-1 rounded-full uppercase tracking-widest mt-4">Voice Active</div>
          </div>
          <div className="flex-1 w-full bg-black/20 rounded-[2.5rem] p-6 text-center backdrop-blur-3xl">
            <p className="text-white text-xl font-bold">{isConnectingVoice ? "Connecting..." : (liveTranscript || "Listening...")}</p>
          </div>
          <div className="pb-20 pt-10"><button onClick={stopLiveVoice} className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center border-4 border-white/10 active:scale-90 transition-all"><PhoneOff size={28} /></button></div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen h-[100dvh] bg-white font-jakarta">
      {view === 'landing' && renderLanding()}
      {view === 'agent-selection' && renderAgentSelection()}
      {view === 'mode-selection' && renderModeSelection()}
      {view === 'chat' && renderChat()}
      {showEntryForm && <LeadForm initialData={{}} onClose={() => setShowEntryForm(false)} onSuccess={handleEntrySuccess} onIneligible={() => { setShowEntryForm(false); setView('landing'); }} />}
      {showBooking && <BookingForm onClose={() => setShowBooking(false)} />}
    </div>
  );
};

export default App;
