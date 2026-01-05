
import React, { useState, useRef, useEffect } from 'react';
import { AGENTS, COMPANY_INFO, KNOWLEDGE_BASE } from './constants';
import { Agent, Message, LeadData } from './types';
import { generateChatResponseStream, encodeAudioPCM, decodeAudioData, decodeBase64Audio, leadCaptureTool } from './services/geminiService';
import { GoogleGenAI, Modality } from '@google/genai';
import BookingForm from './components/BookingForm';
import LeadForm from './components/LeadForm';
import { 
  Send, 
  Mic, 
  ChevronLeft,
  MessageCircle,
  PhoneCall,
  ArrowRight,
  Calendar,
  Sparkles,
  ShieldCheck,
  Globe,
  Keyboard,
  Mic2,
  Loader2,
  Volume2,
  AlertCircle,
  User,
  Headphones,
  PhoneOff
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
  const [leadFormData, setLeadFormData] = useState<Partial<LeadData> | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
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
    if (selectedAgent && messages.length === 0 && view === 'chat') {
      if (!isLiveVoice) {
        const triggerGreeting = async () => {
          setIsTyping(true);
          const assistantId = 'greeting-id';
          const assistantMsg: Message = {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: new Date()
          };
          setMessages([assistantMsg]);

          try {
            const greetingPrompt = `Act as ${selectedAgent.name}. Introduce yourself from Better Call Immigration. Greet warmly in ${selectedAgent.language} and ask for my NAME first. Do not mention links.`;
            const stream = generateChatResponseStream(selectedAgent, [], greetingPrompt);
            
            let fullContent = "";
            let lastUpdate = Date.now();
            
            for await (const chunk of stream) {
              if (chunk.type === 'text') {
                fullContent += chunk.content;
                if (Date.now() - lastUpdate > 60) {
                  setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
                  lastUpdate = Date.now();
                }
              }
            }
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
          } catch (e) {
            console.error("Greeting failed", e);
          } finally {
            setIsTyping(false);
          }
        };
        triggerGreeting();
      } else {
        startLiveVoice();
      }
    }
  }, [selectedAgent, view, isLiveVoice]);

  const startLiveVoice = async () => {
    if (!selectedAgent || isConnectingVoice) return;
    setIsConnectingVoice(true);
    setVoiceError(null);
    setLiveTranscript('');
    currentOutputTranscriptionRef.current = '';
    
    try {
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      if (outCtx.state === 'suspended') await outCtx.resume();
      if (inCtx.state === 'suspended') await inCtx.resume();
      
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
            
            sessionPromise.then(s => {
               const triggerData = new Int16Array(1600).fill(0); // Shorter trigger
               const triggerBase64 = btoa(String.fromCharCode(...new Uint8Array(triggerData.buffer)));
               s.sendRealtimeInput({ media: { data: triggerBase64, mimeType: 'audio/pcm;rate=16000' } }); 
            }).catch(err => console.error("Initial trigger failed:", err));

            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(2048, 1, 1); // Lower buffer for less lag
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBase64 = encodeAudioPCM(inputData);
              sessionPromise.then(s => {
                if (s) {
                  s.sendRealtimeInput({ 
                    media: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' } 
                  });
                }
              }).catch(() => {});
            };
            
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (msg: any) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'openLeadForm') {
                  setLeadFormData(fc.args);
                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Verification form displayed to user." } }
                  }));
                }
              }
            }
            if (msg.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += msg.serverContent.outputTranscription.text;
              setLiveTranscript(currentOutputTranscriptionRef.current);
            }
            
            if (msg.serverContent?.turnComplete) {
              if (currentOutputTranscriptionRef.current) {
                setMessages(prev => [...prev, { 
                  id: Date.now().toString(), 
                  role: 'assistant', 
                  content: currentOutputTranscriptionRef.current, 
                  timestamp: new Date() 
                }]);
              }
              currentOutputTranscriptionRef.current = '';
            }

            const parts = msg.serverContent?.modelTurn?.parts;
            if (parts && Array.isArray(parts)) {
              for (const part of parts) {
                if (part.inlineData?.data && audioContextRef.current) {
                  const ctx = audioContextRef.current;
                  const audioBase64 = part.inlineData.data;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                  const audioBuffer = await decodeAudioData(decodeBase64Audio(audioBase64), ctx, 24000, 1);
                  const source = ctx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(ctx.destination);
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  activeSourcesRef.current.add(source);
                  source.onended = () => activeSourcesRef.current.delete(source);
                }
              }
            }

            if (msg.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              currentOutputTranscriptionRef.current = '';
              setLiveTranscript('');
            }
          },
          onclose: (e) => {
            if (e.code !== 1000) {
              setVoiceError("Connection closed.");
              setTimeout(() => stopLiveVoice(), 2000);
            }
          },
          onerror: (e) => {
            setVoiceError("Voice system error.");
            setTimeout(() => stopLiveVoice(), 2000);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{ functionDeclarations: [leadCaptureTool] }],
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: selectedAgent.voiceName } 
            } 
          },
          systemInstruction: `
            You are ${selectedAgent.name}, a warm smart advisor at Better Call Immigration Dubai.
            Speak ONLY in ${selectedAgent.language}.

            STRICT VOICE FLOW:
            1. Introduce yourself and ask for NAME.
            2. Step-by-step gather details (Nationality, Age, Profession, Phone, Email).
            3. SPECIAL: Never say "sending a link". Say "Opening the profile form for you now".
            4. Keep responses extremely brief (1-2 sentences).
            5. Use database: ${KNOWLEDGE_BASE}.
          `
        }
      });
      
      liveSessionRef.current = await sessionPromise;
      
    } catch (err: any) {
      setVoiceError("Failed to connect.");
      setIsConnectingVoice(false);
      setTimeout(() => stopLiveVoice(), 2000);
    }
  };

  const stopLiveVoice = () => {
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch(e) {}
      liveSessionRef.current = null;
    }
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    activeSourcesRef.current.clear();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch(e) {}
      audioContextRef.current = null;
    }
    if (inputAudioContextRef.current) {
      try { inputAudioContextRef.current.close(); } catch(e) {}
      inputAudioContextRef.current = null;
    }
    setIsLiveVoice(false);
    setIsConnectingVoice(false);
    setLiveTranscript('');
    setVoiceError(null);
    currentOutputTranscriptionRef.current = '';
    setView('mode-selection');
    setMessages([]);
  };

  const handleSend = async (text: string = input) => {
    const trimmed = text.trim();
    if (!trimmed || !selectedAgent) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: trimmed, timestamp: new Date() }]);
    setInput('');
    setIsTyping(true);
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
    
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const stream = generateChatResponseStream(selectedAgent, history, trimmed);
      let fullContent = "";
      let lastUpdate = Date.now();

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
          if (Date.now() - lastUpdate > 80) { 
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
            lastUpdate = Date.now();
          }
        } else if (chunk.type === 'tool' && chunk.name === 'openLeadForm') {
          setLeadFormData(chunk.args);
        }
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsTyping(false); 
    }
  };

  const renderLanding = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#fdfdff] font-jakarta overflow-hidden">
      <div className="flex-1 overflow-y-auto ios-scroll">
        <header className="px-6 pt-16 pb-12 bg-white border-b border-slate-100 text-center relative overflow-hidden shrink-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[80px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 rounded-full blur-[100px]"></div>
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-24 h-24 flex items-center justify-center mb-8 animate-in zoom-in duration-700">
              <div className="p-2 bg-white rounded-[2rem] shadow-2xl vibrant-shadow">
                <img src={LOGO_URL} alt="Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            
            <h1 className="text-3xl font-[900] tracking-tight text-slate-900 leading-tight uppercase mb-4">
              Better Call<br/>
              <span className="gradient-text">Immigration</span>
            </h1>
            
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
              <ShieldCheck size={10} className="text-indigo-600" />
              <p className="text-indigo-600 text-[8px] font-black uppercase tracking-[0.3em]">Official Advisor Portal</p>
            </div>
          </div>
        </header>

        <div className="px-6 py-10 flex flex-col gap-5 max-w-sm mx-auto w-full relative z-20">
          <button 
            onClick={() => setView('agent-selection')}
            className="group w-full flex items-center gap-4 p-5 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] shadow-xl active:scale-[0.97] transition-all text-left"
          >
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white shrink-0">
              <MessageCircle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-white uppercase tracking-tight leading-none mb-1">AI Chat</h3>
              <p className="text-[8px] text-indigo-100 font-bold uppercase tracking-widest opacity-80">16 Countries Support</p>
            </div>
            <ArrowRight className="text-white/40" size={20} />
          </button>

          <button 
            onClick={() => setShowBooking(true)}
            className="group w-full flex items-center gap-4 p-5 bg-slate-900 rounded-[2rem] shadow-xl active:scale-[0.97] transition-all text-left"
          >
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white shrink-0">
              <Calendar size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-white uppercase tracking-tight leading-none mb-1">Book Now</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest opacity-80">Human Expert Consultation</p>
            </div>
            <ArrowRight className="text-white/20" size={20} />
          </button>
        </div>
      </div>

      <footer className="p-8 text-center border-t border-slate-50 opacity-40 shrink-0 safe-bottom">
        <div className="flex items-center justify-center gap-2">
          <Globe size={10} />
          <p className="text-[7px] font-black text-slate-900 uppercase tracking-[0.5em]">{COMPANY_INFO.name}</p>
        </div>
      </footer>
    </div>
  );

  const renderAgentSelection = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#f8fafc] overflow-hidden">
      <header className="px-6 pt-16 pb-6 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-[100] shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('landing')} className="p-2 -ml-2 text-slate-950 active:scale-90 transition-transform">
            <ChevronLeft size={28} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none">Advisor</h2>
            <p className="text-[8px] font-black uppercase text-indigo-600 tracking-widest mt-1">Select Language</p>
          </div>
        </div>
        <img src={LOGO_URL} alt="Logo" className="w-8 h-8 object-contain" />
      </header>
      
      <div className="flex-1 px-4 pt-6 pb-24 overflow-y-auto ios-scroll">
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => { setSelectedAgent(agent); setView('mode-selection'); }}
              className="group flex items-center gap-3 p-4 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-indigo-600 hover:shadow-lg active:scale-[0.96] transition-all text-left"
            >
              <div className="w-11 h-11 flex items-center justify-center text-2xl bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform shrink-0 shadow-inner">
                {agent.flag}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[12px] font-black text-slate-900 tracking-tight leading-none mb-1 uppercase truncate">{agent.nativeName}</h3>
                <p className="text-[8px] font-black uppercase text-indigo-600 tracking-widest truncate opacity-60">{agent.language}</p>
              </div>
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
          <div className="text-7xl mb-6 animate-bounce duration-1000">{selectedAgent?.flag}</div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-2">Connect with {selectedAgent?.nativeName}</h2>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em]">Choose your preference</p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <button 
            onClick={() => { setIsLiveVoice(false); setView('chat'); }}
            className="group w-full flex items-center justify-between p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm hover:border-indigo-600 hover:shadow-xl active:scale-95 transition-all text-left"
          >
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors shadow-inner">
                <Keyboard size={24} />
              </div>
              <div>
                <p className="text-base font-black text-slate-900 uppercase tracking-tight">Text Chat</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Instant Messaging</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 group-hover:translate-x-1 transition-all">
              <ArrowRight className="text-slate-400 group-hover:text-indigo-600" size={18} />
            </div>
          </button>

          <button 
            onClick={() => { setIsLiveVoice(true); setView('chat'); }}
            className="group w-full flex items-center justify-between p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm hover:border-indigo-600 hover:shadow-xl active:scale-95 transition-all text-left"
          >
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors shadow-inner">
                <Mic2 size={24} />
              </div>
              <div>
                <p className="text-base font-black text-slate-900 uppercase tracking-tight">Live Voice</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real-time Audio</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-violet-50 group-hover:translate-x-1 transition-all">
              <ArrowRight className="text-slate-400 group-hover:text-violet-600" size={18} />
            </div>
          </button>
        </div>
      </div>

      <button 
        onClick={() => setView('agent-selection')}
        className="mb-12 text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] flex items-center gap-2 hover:text-indigo-600 transition-colors self-center bg-white px-6 py-3 rounded-full border border-slate-100 shadow-sm"
      >
        <ChevronLeft size={16} /> Back to agents
      </button>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-white overflow-hidden relative">
      <header className="px-5 pt-16 pb-5 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-[100] shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { 
            if (isLiveVoice) stopLiveVoice();
            setView('mode-selection'); 
            setMessages([]); 
          }} className="p-2 -ml-2 text-slate-950 active:scale-90 transition-transform">
            <ChevronLeft size={28} />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-2xl drop-shadow-sm">{selectedAgent?.flag}</div>
            <div>
              <h1 className="text-[15px] font-black text-slate-900 tracking-tight leading-none">{selectedAgent?.nativeName}</h1>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Online Advisor</p>
              </div>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setShowBooking(true)} 
          className="p-3.5 bg-indigo-600 text-white rounded-2xl active:scale-90 hover:bg-indigo-700 transition-all shadow-lg vibrant-shadow"
        >
          <Calendar size={18} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-8 space-y-6 ios-scroll bg-[#fbfbfe] min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-3`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mr-2 self-end mb-1 shrink-0 border border-slate-200">
                <span className="text-sm">{selectedAgent?.flag}</span>
              </div>
            )}
            <div className={`max-w-[80%] p-4 rounded-3xl ${
              msg.role === 'user' 
                ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-none shadow-xl vibrant-shadow shadow-indigo-600/20' 
                : 'bg-white text-slate-900 rounded-tl-none border border-slate-100 shadow-md'
            }`}>
              <div className="text-[15px] leading-relaxed tracking-tight font-medium">
                {msg.content || (isTyping && msg.id === 'greeting-id' ? "Starting chat..." : "")}
              </div>
              <div className={`text-[9px] mt-2.5 opacity-40 font-black uppercase tracking-widest flex items-center gap-1.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? <User size={8}/> : <Headphones size={8}/>}
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isTyping && !isLiveVoice && messages[messages.length-1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mr-2 self-end mb-1 shrink-0">
               <span className="text-sm">{selectedAgent?.flag}</span>
            </div>
            <div className="bg-white border border-slate-100 p-5 rounded-3xl rounded-tl-none flex gap-2 shadow-sm">
              <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-10" />
      </main>

      {!isLiveVoice && (
        <footer className="px-5 pt-4 pb-12 bg-white/95 backdrop-blur-xl border-t border-slate-100 safe-bottom shrink-0 z-10">
          <div className="bg-[#f0f2f5] rounded-[2rem] p-2 flex items-center border border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 focus-within:shadow-2xl transition-all max-w-xl mx-auto shadow-inner">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Ask ${selectedAgent?.name} anything...`}
              className="flex-1 bg-transparent border-none outline-none px-5 py-3.5 text-slate-800 font-semibold placeholder-slate-400 text-[15px] max-h-32 resize-none"
            />
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center disabled:opacity-20 active:scale-90 hover:bg-indigo-700 transition-all shadow-lg shrink-0 vibrant-shadow"
            >
              <Send size={22} className="ml-1" />
            </button>
          </div>
        </footer>
      )}

      {isLiveVoice && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col items-center animate-in slide-in-from-bottom duration-500 overflow-hidden h-[100dvh]">
          {/* Animated Background Layers */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(79,70,229,0.12),transparent_60%)] pointer-events-none"></div>
          
          <div className="flex-1 w-full overflow-y-auto ios-scroll flex flex-col items-center pt-12 px-6 space-y-8 min-h-0 relative z-10">
            {/* Header Area */}
            <div className="text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-indigo-500/10 blur-[40px] rounded-full animate-pulse"></div>
                <div className="text-[70px] drop-shadow-[0_10px_30px_rgba(79,70,229,0.4)] animate-in zoom-in-50 duration-700">{selectedAgent?.flag}</div>
              </div>
              <h2 className="text-2xl font-[900] uppercase text-white tracking-tighter mb-2">{selectedAgent?.nativeName}</h2>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </div>
                <p className="text-indigo-300 font-black uppercase text-[9px] tracking-[0.2em]">Live Database Connection</p>
              </div>
            </div>

            {/* Central Visualizer Area */}
            <div className="w-full flex flex-col items-center gap-6 relative max-w-md">
              <div className={`relative w-32 h-32 transition-all duration-700 flex items-center justify-center ${isConnectingVoice ? 'scale-75 opacity-40 blur-md' : 'scale-100 opacity-100'}`}>
                <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(79,70,229,0.3)] border border-white/5 relative z-20">
                  {isConnectingVoice ? (
                    <Loader2 size={40} className="text-white animate-spin opacity-40" />
                  ) : (
                    <div className="flex items-end gap-1 h-10">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`w-1 rounded-full bg-white/90 animate-voice-bar`} style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }}></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Transcript Display */}
              <div className="w-full bg-white/5 border border-white/10 p-5 rounded-[2rem] min-h-[120px] flex flex-col items-center justify-center text-center backdrop-blur-3xl shadow-2xl relative overflow-hidden transition-all duration-500 border-b-white/15">
                {voiceError ? (
                  <div className="flex flex-col items-center gap-2 text-red-400">
                    <AlertCircle size={20} className="animate-bounce" />
                    <p className="text-[9px] font-black uppercase tracking-[0.1em]">{voiceError}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className={`text-lg font-bold text-white leading-tight tracking-tight ${!liveTranscript ? 'italic text-white/30 font-medium' : ''}`}>
                      {isConnectingVoice ? "Initializing smart advisor..." : (liveTranscript || `Say "Hello" to start...`)}
                    </p>
                    {liveTranscript && !isConnectingVoice && (
                      <span className="text-[8px] font-black uppercase text-indigo-400 tracking-[0.2em] animate-pulse">Syncing...</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="h-10 shrink-0" />
          </div>

          {/* End Call Button Area */}
          <div className="w-full px-8 pb-10 pt-4 flex flex-col items-center gap-4 bg-slate-950/80 shrink-0 relative z-[1100] safe-bottom">
            <button 
              onClick={stopLiveVoice} 
              className="group relative w-16 h-16 bg-red-600 text-white rounded-[2rem] flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.2)] active:scale-90 transition-all border-[4px] border-slate-950"
            >
              <PhoneOff size={24} />
            </button>
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">Close Consultation</p>
          </div>
        </div>
      )}
      
      {leadFormData && (
        <LeadForm 
          initialData={leadFormData} 
          onClose={() => setLeadFormData(null)} 
          onSuccess={() => {
            setLeadFormData(null);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Confirmed! Your profile is submitted. Our expert human advisor will call you shortly.", timestamp: new Date() }]);
          }} 
        />
      )}

      <style>{`
        @keyframes voice-bar {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
        .animate-voice-bar {
          animation: voice-bar 0.6s infinite ease-in-out;
        }
      `}</style>
    </div>
  );

  return (
    <div className="h-screen h-[100dvh] bg-white">
      {view === 'landing' && renderLanding()}
      {view === 'agent-selection' && renderAgentSelection()}
      {view === 'mode-selection' && renderModeSelection()}
      {view === 'chat' && renderChat()}
      {showBooking && <BookingForm onClose={() => setShowBooking(false)} />}
    </div>
  );
};

export default App;
