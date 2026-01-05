
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ADVISORS, COMPANY_INFO, NATIONALITIES } from '../constants';
import { ConsultationMode, Advisor } from '../types';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  CheckCircle, 
  MapPin, 
  Video, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  AlertCircle, 
  Clock, 
  Zap, 
  Calendar,
  ShieldCheck,
  Ticket,
  ExternalLink,
  QrCode,
  Globe,
  Navigation,
  Headset,
  Flag,
  CalendarCheck
} from 'lucide-react';

interface CalSlot {
  time: string;
}

interface BookingFormProps {
  onClose: () => void;
}

const BookingForm: React.FC<BookingFormProps> = ({ onClose }) => {
  const [step, setStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<CalSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolvedEventTypeId, setResolvedEventTypeId] = useState<number | null>(null);
  
  const getLocalDateString = (date: Date) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    nationality: '',
    mode: null as ConsultationMode | null,
    advisorId: null as string | null,
    date: getLocalDateString(new Date()),
    time: '' 
  });

  const [viewDate, setViewDate] = useState(new Date());
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentAdvisor = useMemo(() => ADVISORS.find(a => a.id === formData.advisorId), [formData.advisorId]);

  const formattedSelectedDate = useMemo(() => {
    if (!formData.date) return '';
    const [year, month, day] = formData.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }, [formData.date]);

  useEffect(() => {
    const resolveEventType = async () => {
      if (!currentAdvisor || !formData.mode) return;
      const slug = formData.mode === 'Google Meet' ? currentAdvisor.meetSlug : currentAdvisor.officeSlug;
      try {
        setSlotsLoading(true);
        const res = await fetch(`https://api.cal.com/v1/event-types?apiKey=${currentAdvisor.calApiKey}`);
        if (!res.ok) throw new Error("Connection issue.");
        const data = await res.json();
        const eventTypes = data.event_types || [];
        const match = eventTypes.find((et: any) => et.slug === slug) || eventTypes[0];
        if (match) setResolvedEventTypeId(match.id);
        else throw new Error("Consultation channel restricted.");
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSlotsLoading(false);
      }
    };
    if (formData.mode && currentAdvisor) resolveEventType();
  }, [formData.mode, currentAdvisor]);

  const fetchAvailability = async (targetDate: string) => {
    if (!targetDate || !formData.advisorId || !currentAdvisor || !resolvedEventTypeId) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setSlotsLoading(true);
    setError(null);
    setAvailableSlots([]);
    const startRange = new Date(`${targetDate}T00:00:00`);
    const endRange = new Date(`${targetDate}T23:59:59`);
    try {
      const params = new URLSearchParams({
        apiKey: currentAdvisor.calApiKey,
        eventTypeId: resolvedEventTypeId.toString(),
        startTime: startRange.toISOString(),
        endTime: endRange.toISOString(),
        timeZone: "Asia/Dubai",
        language: "en"
      });
      const response = await fetch(`https://api.cal.com/v1/slots?${params.toString()}`, { signal: abortControllerRef.current.signal });
      if (!response.ok) throw new Error(`Handshake error: ${response.status}`);
      const data = await response.json();
      let slots: any[] = [];
      if (data.slots && typeof data.slots === 'object') {
        const allKeys = Object.keys(data.slots);
        const matchingKey = allKeys.find(k => k.includes(targetDate)) || allKeys[0];
        slots = data.slots[matchingKey] || [];
      } else if (Array.isArray(data)) slots = data;
      setAvailableSlots(slots.map((s: any) => ({ time: s.time })));
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(`Consultation Sync Failure: ${err.message}`);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (step === 3 && formData.date && resolvedEventTypeId) fetchAvailability(formData.date);
    return () => abortControllerRef.current?.abort();
  }, [formData.date, resolvedEventTypeId, step]);

  const handleBook = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.time || !resolvedEventTypeId || !formData.nationality) {
        setError("Please complete all verification fields.");
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.cal.com/v1/bookings?apiKey=${currentAdvisor?.calApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: resolvedEventTypeId,
          start: formData.time,
          language: 'en',
          timeZone: "Asia/Dubai",
          responses: { 
            name: formData.name, 
            email: formData.email, 
            location: {
              value: formData.mode === 'Google Meet' ? 'integrations:google:meet' : 'inPerson',
              optionValue: formData.mode === 'Google Meet' ? '' : COMPANY_INFO.address
            }
          }
        })
      });
      if (res.ok) setIsSuccess(true);
      else throw new Error("Unable to confirm appointment slot.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const calendarDays = useMemo(() => {
    const month = viewDate.getMonth(), year = viewDate.getFullYear();
    const days = [], last = new Date(year, month + 1, 0).getDate(), first = new Date(year, month, 1).getDay();
    for (let i = 0; i < first; i++) days.push(null);
    for (let i = 1; i <= last; i++) days.push(new Date(year, month, i));
    return days;
  }, [viewDate]);

  if (isSuccess) return (
    <div className="fixed inset-0 z-[2000] bg-[#fdfdff] flex flex-col items-center p-6 pt-20 text-center animate-in fade-in zoom-in font-jakarta overflow-y-auto">
      <div className="w-16 h-16 bg-green-500 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl mb-8">
        <CalendarCheck size={32}/>
      </div>
      
      <div className="w-full max-w-[340px] bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden mb-10 border border-white/10 relative">
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-start border-b border-white/5 pb-4">
            <div className="text-left">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Lead Advisor</p>
              <p className="text-xl font-black text-white leading-none uppercase">{currentAdvisor?.name}</p>
            </div>
          </div>
          
          <div className="space-y-4 text-left">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Date & Time</p>
              <p className="text-[12px] font-black uppercase text-white tracking-tight">{formattedSelectedDate}</p>
              <p className="text-base font-black uppercase text-indigo-400 mt-1">
                {new Date(formData.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-black text-slate-900 uppercase mb-4">Confirmed</h2>
      <button onClick={onClose} className="w-full max-w-[200px] py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">
        Close
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-in slide-in-from-bottom overflow-hidden font-jakarta">
      <header className="px-6 pt-16 pb-4 flex items-center justify-between border-b border-slate-100 bg-white z-50 shrink-0">
        <button onClick={onClose} className="p-2 -ml-2 text-slate-950 active:scale-90">
          <X size={28}/>
        </button>
        <div className="flex flex-col items-center flex-1">
           <div className="flex gap-1 mb-2">
              {[1,2,3,4].map(i => (
                <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === step ? 'w-6 bg-indigo-600' : i < step ? 'w-1.5 bg-indigo-200' : 'w-1.5 bg-slate-100'}`}></div>
              ))}
           </div>
           <p className="text-[7px] font-black uppercase text-slate-400 tracking-[0.3em]">{["Advisor", "Mode", "Time", "Info"][step-1]}</p>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8 space-y-8 bg-[#fdfdff] ios-scroll pb-12">
        {error && (
          <div className="p-4 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-3 rounded-2xl border border-red-100">
            <AlertCircle size={18} className="shrink-0" /> 
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-3">
             <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-slate-900 uppercase">Consultant</h3>
             </div>
             <div className="grid grid-cols-1 gap-3">
                {ADVISORS.map(a => (
                  <button 
                    key={a.id} 
                    onClick={() => { setFormData({...formData, advisorId: a.id}); setStep(2); }} 
                    className="flex items-center gap-4 p-5 rounded-[1.75rem] border-2 border-slate-100 bg-white hover:border-indigo-600 active:scale-[0.98] transition-all"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                      {a.initials}
                    </div>
                    <div className="flex-1 text-left">
                      <h4 className="font-black uppercase text-sm text-slate-900 leading-none mb-1">{a.name}</h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{a.languages.join(' • ')}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-200" />
                  </button>
                ))}
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-3">
             <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-slate-900 uppercase">Modality</h3>
             </div>
             <div className="space-y-4">
                {[
                  { m: 'Google Meet', i: Video },
                  { m: 'In-person Office', i: MapPin }
                ].map((item) => (
                  <button key={item.m} onClick={() => { setFormData({...formData, mode: item.m as ConsultationMode}); setStep(3); }} className="w-full flex items-center gap-5 p-6 rounded-[1.75rem] border-2 border-slate-100 bg-white hover:border-indigo-600 active:scale-[0.98] transition-all text-left">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900 text-white"><item.i size={24}/></div>
                    <p className="font-black uppercase text-sm text-slate-900">{item.m}</p>
                    <ChevronRight size={18} className="text-slate-200 ml-auto" />
                  </button>
                ))}
             </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-3 pb-8">
             <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-slate-900 uppercase">Timeline</h3>
             </div>
             <div className="bg-slate-950 rounded-[2rem] p-6 text-white mb-6">
                <div className="flex justify-between items-center mb-6">
                  <p className="font-black uppercase text-[10px] tracking-widest text-indigo-400">{viewDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()-1)))} className="p-2 bg-white/5 rounded-lg"><ChevronLeft size={16}/></button>
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()+1)))} className="p-2 bg-white/5 rounded-lg"><ChevronRight size={16}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((d, i) => d ? (
                    <button key={i} onClick={() => { setFormData({...formData, date: getLocalDateString(d)}); setAvailableSlots([]); }} className={`aspect-square rounded-lg text-[12px] font-black flex items-center justify-center ${formData.date === getLocalDateString(d) ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                        {d.getDate()}
                      </button>
                  ) : <div key={i}/>)}
                </div>
             </div>
             <div className="space-y-4">
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-indigo-600" /></div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {availableSlots.map((s, i) => (
                      <button key={i} onClick={() => setFormData({...formData, time: s.time})} className={`py-4 rounded-xl border-2 font-black text-[11px] uppercase tracking-widest ${formData.time === s.time ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-100 bg-white text-slate-500'}`}>
                        {new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' })}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[10px] font-black text-slate-400 uppercase">No slots available</p>
                )}
             </div>
             {formData.time && (
               <button onClick={() => setStep(4)} className="w-full mt-8 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest">
                 Next Step
               </button>
             )}
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right-3">
             <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-slate-900 uppercase">Identity</h3>
             </div>
             <div className="space-y-5">
                <input 
                  type="text" 
                  placeholder="FULL NAME" 
                  className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.5rem] font-bold text-sm outline-none focus:border-indigo-600"
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                />
                <input 
                  type="tel" 
                  placeholder="PHONE (+971...)" 
                  className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.5rem] font-bold text-sm outline-none focus:border-indigo-600"
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                />
                <select 
                  className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.5rem] font-bold text-sm outline-none focus:border-indigo-600"
                  value={formData.nationality} 
                  onChange={e => setFormData({...formData, nationality: e.target.value})}
                >
                  <option value="" disabled>NATIONALITY</option>
                  {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <input 
                  type="email" 
                  placeholder="EMAIL ADDRESS" 
                  className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.5rem] font-bold text-sm outline-none focus:border-indigo-600"
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
             </div>
             <button 
               disabled={loading || !formData.name || !formData.email || !formData.phone || !formData.nationality} 
               onClick={handleBook} 
               className="w-full mt-10 py-6 bg-indigo-600 text-white rounded-[1.75rem] font-black uppercase tracking-widest text-[11px] disabled:opacity-30"
             >
                {loading ? <Loader2 className="animate-spin mx-auto" size={20}/> : "Secure Session"}
             </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingForm;
