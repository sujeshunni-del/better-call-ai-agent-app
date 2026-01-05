
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
  Mic2
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
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showBooking, setShowBooking] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentOutputTranscriptionRef = useRef('');

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
            for await (const chunk of stream) {
              fullContent += chunk;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
            }
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
    if (!selectedAgent) return;
    setIsLiveVoice(true);
    setLiveTranscript('');
    currentOutputTranscriptionRef.current = '';
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    await outCtx.resume();
    await inCtx.resume();
    audioContextRef.current = outCtx;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          const source = inCtx.createMediaStreamSource(stream);
          const processor = inCtx.createScriptProcessor(2048, 1, 1);
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBase64 = encodeAudioPCM(inputData);
            sessionPromise.then(s => s.sendRealtimeInput({ media: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' } }));
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
               setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: currentOutputTranscriptionRef.current, timestamp: new Date() }]);
            }
            currentOutputTranscriptionRef.current = '';
          }
          const audioBase64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioBase64 && audioContextRef.current) {
            const ctx = audioContextRef.current;
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
          if (msg.serverContent?.interrupted) {
            activeSourcesRef.current.forEach(s => s.stop());
            activeSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            currentOutputTranscriptionRef.current = '';
            setLiveTranscript('');
          }
        },
        onclose: () => setIsLiveVoice(false),
        onerror: () => setIsLiveVoice(false)
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedAgent.voiceName } } },
        systemInstruction: `You are ${selectedAgent.name}. A young, smart, friendly female advisor. Use human fillers like "hmm". Speak only in ${selectedAgent.language} script. Strictly follow flow: greet/ask Name -> ask Profession -> ask Age -> suggest Job from database.`
      }
    });
    liveSessionRef.current = await sessionPromise;
  };

  const stopLiveVoice = () => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    setIsLiveVoice(false);
    setView('landing');
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
      for await (const chunk of stream) {
        fullContent += chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
      }
    } catch (e) { console.error(e); } finally { setIsTyping(false); }
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
          <button onClick={() => setView('landing')} className="p-2 -ml-2 text-slate-900 active:scale-90 transition-transform">
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
          <button onClick={() => { setView('mode-selection'); setMessages([]); }} className="p-2 -ml-2 text-slate-900 active:scale-90 transition-transform">
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
        <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col items-center animate-in slide-in-from-bottom overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-600/10 via-transparent to-violet-600/10 pointer-events-none"></div>
          
          <div className="flex-1 w-full overflow-y-auto ios-scroll flex flex-col items-center py-16 px-8 space-y-12 min-h-0">
            <div className="text-center relative z-10">
              <div className="text-7xl mb-8 drop-shadow-2xl">{selectedAgent?.flag}</div>
              <h2 className="text-3xl font-black uppercase text-white">{selectedAgent?.nativeName}</h2>
              <div className="inline-flex items-center gap-2 mt-4 px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full">
                <Sparkles size={12} className="text-indigo-400" />
                <p className="text-indigo-300 font-black uppercase text-[8px] tracking-[0.3em] animate-pulse">Voice Session</p>
              </div>
            </div>

            <div className="w-full flex flex-col items-center gap-10 z-10">
              <div className="w-36 h-36 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(79,70,229,0.4)] relative">
                <div className="absolute inset-[-15%] bg-indigo-600 rounded-full animate-voice opacity-10 scale-125"></div>
                <Mic size={48} className="text-white relative z-10"/>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] w-full min-h-[100px] flex items-center justify-center text-center backdrop-blur-3xl">
                <p className="text-lg font-medium italic text-indigo-100 leading-snug tracking-tight">
                  {liveTranscript || "Listening..."}
                </p>
              </div>
            </div>
            <div className="h-20 shrink-0" />
          </div>

          <div className="w-full px-8 pb-16 pt-6 flex justify-center bg-gradient-to-t from-slate-950 to-transparent shrink-0">
            <button onClick={stopLiveVoice} className="w-20 h-20 bg-red-600 text-white rounded-[2.5rem] flex items-center justify-center shadow-2xl active:scale-90 transition-all z-[1100]">
              <PhoneCall size={32} />
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
