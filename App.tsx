
import React, { useState, useRef, useEffect } from 'react';
import { AGENTS, COMPANY_INFO } from './constants';
import { Agent, Message } from './types';
import { generateChatResponseStream, encodeAudioPCM, decodeAudioData, decodeBase64Audio } from './services/geminiService';
import { GoogleGenAI, Modality } from '@google/genai';
import BookingForm from './components/BookingForm';
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
  AlertCircle
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
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentOutputTranscriptionRef = useRef('');
  const micStreamRef = useRef<MediaStream | null>(null);
  
  // Buffering ref to prevent lag in chat
  const chatBufferRef = useRef<string>('');

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
            const greetingPrompt = "Act naturally as a smart young female advisor. Use a human filler like hmm, then greet me warmly in your native script and ask for my name first. Keep it very brief.";
            const stream = generateChatResponseStream(selectedAgent, [], greetingPrompt);
            
            let fullContent = "";
            let lastUpdate = Date.now();
            
            for await (const chunk of stream) {
              fullContent += chunk;
              // Throttle UI updates to 60ms to prevent lag
              if (Date.now() - lastUpdate > 60) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
                lastUpdate = Date.now();
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
            console.debug("Live Voice Session Opened");
            setIsConnectingVoice(false);
            
            // Proactive trigger: Send silent buffer to force the model to start its turn (Greeting)
            sessionPromise.then(s => {
               const triggerData = new Int16Array(16000).fill(0); // 1s of silence
               const triggerBase64 = btoa(String.fromCharCode(...new Uint8Array(triggerData.buffer)));
               s.sendRealtimeInput({ media: { data: triggerBase64, mimeType: 'audio/pcm;rate=16000' } }); 
            }).catch(err => console.error("Initial trigger failed:", err));

            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            
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
              setVoiceError("Connection lost. Returning to safety.");
              setTimeout(() => stopLiveVoice(), 2000);
            }
          },
          onerror: (e) => {
            setVoiceError("Voice service error.");
            setTimeout(() => stopLiveVoice(), 2000);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: selectedAgent.voiceName } 
            } 
          },
          systemInstruction: `You are ${selectedAgent.name}, a friendly female advisor at Better Call Immigration Dubai. 
          CRITICAL: You MUST speak exclusively in ${selectedAgent.language} using the appropriate native script and phonetics. 
          PROACTIVE START: Immediately greet the user in ${selectedAgent.language} and say: "Hello, I am ${selectedAgent.name}. I'm here to help you with European job visas. What is your name?"
          Stay in character as a young, smart professional.
          Keep responses extremely brief (1-2 short sentences). 
          Flow: Introduce yourself -> Ask Name -> Ask Profession -> Ask Age -> Suggest jobs.
          Database: Use the European 16-country knowledge base.
          Tone: Bright, warm, helpful.`
        }
      });
      
      liveSessionRef.current = await sessionPromise;
      
    } catch (err: any) {
      console.error("Voice initialization failed:", err);
      setVoiceError("Could not start voice session.");
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
        fullContent += chunk;
        if (Date.now() - lastUpdate > 80) { // Throttle updates to eliminate lag
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
          lastUpdate = Date.now();
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
              className="group flex flex-col items-center gap-3 p-5 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:border-indigo-200 active:scale-95 transition-all text-center"
            >
              <div className="relative shrink-0">
                <div className="text-4xl drop-shadow-sm group-hover:scale-110 transition-transform">{agent.flag}</div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              <div className="min-w-0 w-full">
                <h3 className="text-[12px] font-black text-slate-900 tracking-tight leading-none mb-1 truncate">{agent.nativeName}</h3>
                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest truncate">{agent.language}</p>
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
          <div className="text-6xl mb-6">{selectedAgent?.flag}</div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">Connect with {selectedAgent?.nativeName}</h2>
          <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">Communication Mode</p>
        </div>

        <div className="w-full max-w-xs space-y-4">
          <button 
            onClick={() => { setIsLiveVoice(false); setView('chat'); }}
            className="w-full flex items-center justify-between p-5 bg-white border-2 border-slate-100 rounded-[2rem] shadow-sm hover:border-indigo-600 active:scale-95 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Keyboard size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Text Chat</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Type messages</p>
              </div>
            </div>
            <ArrowRight className="text-slate-200" size={18} />
          </button>

          <button 
            onClick={() => { setIsLiveVoice(true); setView('chat'); }}
            className="w-full flex items-center justify-between p-5 bg-white border-2 border-slate-100 rounded-[2rem] shadow-sm hover:border-indigo-600 active:scale-95 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600">
                <Mic2 size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Live Voice</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Speak real-time</p>
              </div>
            </div>
            <ArrowRight className="text-slate-200" size={18} />
          </button>
        </div>
      </div>

      <button 
        onClick={() => setView('agent-selection')}
        className="mb-12 text-[9px] font-black uppercase text-slate-400 tracking-[0.4em] flex items-center gap-2 hover:text-indigo-600 transition-colors self-center"
      >
        <ChevronLeft size={14} /> Back
      </button>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-screen h-[100dvh] bg-white overflow-hidden relative">
      <header className="px-5 pt-16 pb-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-[100] shrink-0">
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
              <h1 className="text-base font-black text-slate-900 tracking-tight leading-none">{selectedAgent?.nativeName}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Active</p>
              </div>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setShowBooking(true)} 
          className="p-3 bg-indigo-600 text-white rounded-xl active:scale-90 transition-all"
        >
          <Calendar size={18} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-6 ios-scroll bg-slate-50/30 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
            <div className={`max-w-[85%] p-4 rounded-[1.75rem] ${
              msg.role === 'user' 
                ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-none shadow-lg' 
                : 'bg-white text-slate-900 rounded-tl-none border border-slate-100 shadow-sm'
            }`}>
              <div className="text-[14.5px] leading-relaxed tracking-tight font-medium">
                {msg.content || (isTyping && msg.id === 'greeting-id' ? "Connecting..." : "")}
              </div>
              <div className={`text-[8px] mt-2 opacity-50 font-black uppercase tracking-widest ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isTyping && !isLiveVoice && messages[messages.length-1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-4 rounded-[1.75rem] rounded-tl-none flex gap-1.5 shadow-sm">
              <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1.5 h-1.5 bg-indigo-700 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-10" />
      </main>

      {!isLiveVoice && (
        <footer className="px-5 pt-4 pb-12 bg-white/80 backdrop-blur-md border-t border-slate-100 safe-bottom shrink-0 z-10">
          <div className="bg-slate-50 rounded-[1.75rem] p-2 flex items-center border border-slate-200 focus-within:bg-white focus-within:shadow-xl transition-all max-w-lg mx-auto">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Type message...`}
              className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-slate-800 font-bold placeholder-slate-400 text-sm max-h-24 resize-none"
            />
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all shadow-md shrink-0"
            >
              <Send size={20} />
            </button>
          </div>
        </footer>
      )}

      {isLiveVoice && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col items-center animate-in slide-in-from-bottom overflow-hidden h-[100dvh]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent_70%)] pointer-events-none"></div>
          
          <div className="flex-1 w-full overflow-y-auto ios-scroll flex flex-col items-center py-16 px-8 space-y-12 min-h-0">
            <div className="text-center relative z-10">
              <div className="text-8xl mb-10 drop-shadow-2xl animate-in zoom-in duration-500">{selectedAgent?.flag}</div>
              <h2 className="text-3xl font-[900] uppercase text-white tracking-tight mb-4">{selectedAgent?.nativeName}</h2>
              <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-indigo-500/15 border border-indigo-500/30 rounded-full backdrop-blur-md">
                {isConnectingVoice ? (
                   <>
                     <Loader2 size={16} className="text-indigo-400 animate-spin" />
                     <p className="text-indigo-300 font-black uppercase text-[10px] tracking-[0.2em]">Connecting Line...</p>
                   </>
                ) : (
                  <>
                    <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </div>
                    <p className="text-indigo-300 font-black uppercase text-[10px] tracking-[0.2em]">Voice Session Active</p>
                  </>
                )}
              </div>
            </div>

            <div className="w-full flex flex-col items-center gap-10 z-10">
              <div className={`w-48 h-48 bg-indigo-600 rounded-[4rem] flex items-center justify-center shadow-[0_0_80px_rgba(79,70,229,0.4)] relative transition-all duration-700 ${isConnectingVoice ? 'scale-90 opacity-50 blur-sm' : 'scale-100 opacity-100'}`}>
                {!isConnectingVoice && <div className="absolute inset-[-25%] bg-indigo-600 rounded-full animate-voice opacity-10"></div>}
                {isConnectingVoice ? <Loader2 size={64} className="text-white animate-spin opacity-50" /> : <Mic size={64} className="text-white relative z-10" />}
              </div>
              
              <div className="bg-white/[0.03] border border-white/[0.08] p-8 rounded-[3rem] w-full min-h-[160px] flex items-center justify-center text-center backdrop-blur-2xl shadow-inner relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
                <div className="flex flex-col gap-4">
                   {voiceError ? (
                     <div className="flex flex-col items-center gap-2 text-red-400 animate-pulse">
                       <AlertCircle size={24} />
                       <p className="text-sm font-black uppercase tracking-widest">{voiceError}</p>
                     </div>
                   ) : (
                     <p className="text-xl font-medium italic text-indigo-100 leading-relaxed tracking-tight transition-all duration-300">
                      {isConnectingVoice ? "Initializing smart advisor..." : (liveTranscript || `Hello, I'm ${selectedAgent?.name}. How can I help?`)}
                    </p>
                   )}
                  {!isConnectingVoice && !liveTranscript && !voiceError && (
                    <div className="flex items-center justify-center gap-2 opacity-30">
                       <Volume2 size={12} className="text-indigo-400" />
                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Ready for audio</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="h-40 shrink-0" />
          </div>

          <div className="w-full px-8 pb-16 pt-8 flex justify-center bg-gradient-to-t from-slate-950 via-slate-950 to-transparent shrink-0">
            <button 
              onClick={stopLiveVoice} 
              className="w-24 h-24 bg-red-600 text-white rounded-[3rem] flex items-center justify-center shadow-[0_0_50px_rgba(220,38,38,0.5)] active:scale-90 hover:scale-105 transition-all z-[1100] border-[6px] border-slate-950 group"
            >
              <PhoneCall size={38} fill="white" className="group-hover:rotate-12 transition-transform" />
            </button>
          </div>
        </div>
      )}
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
