
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ADVISORS, COMPANY_INFO, NATIONALITIES } from '../constants';
import { ConsultationMode, Advisor } from '../types';
import { 
  X, 
  MapPin, 
  Video, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  AlertCircle, 
  Calendar,
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
        if (!res.ok) throw new Error("Connection failed.");
        const data = await res.json();
        const eventTypes = data.event_types || [];
        const match = eventTypes.find((et: any) => et.slug === slug) || eventTypes[0];
        if (match) {
          setResolvedEventTypeId(match.id);
        } else {
          throw new Error("Advisor offline.");
        }
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
        timeZone: "Asia/Dubai"
      });
      const response = await fetch(`https://api.cal.com/v1/slots?${params.toString()}`, { signal: abortControllerRef.current.signal });
      if (!response.ok) throw new Error(`Fetch failed.`);
      const data = await response.json();
      
      let slots: any[] = [];
      if (data.slots && typeof data.slots === 'object') {
        const allKeys = Object.keys(data.slots);
        const matchingKey = allKeys.find(k => k.includes(targetDate)) || allKeys[0];
        slots = data.slots[matchingKey] || [];
      } else if (Array.isArray(data)) {
        slots = data;
      }
      
      setAvailableSlots(slots.map((s: any) => ({ time: s.time })));
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(`No slots for today.`);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (step === 3 && formData.date && resolvedEventTypeId) {
      fetchAvailability(formData.date);
    }
    return () => abortControllerRef.current?.abort();
  }, [formData.date, resolvedEventTypeId, step]);

  const handleBook = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.time || !resolvedEventTypeId || !formData.nationality) {
        setError("Fill all fields.");
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
          },
          metadata: { phone: formData.phone, nationality: formData.nationality }
        })
      });
      if (res.ok) {
        setIsSuccess(true);
      } else {
        throw new Error("Booking failed.");
      }
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
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col items-center justify-center p-8 text-center animate-in zoom-in duration-300 font-jakarta h-[100dvh]">
      <div className="w-16 h-16 bg-[#075e54] text-white rounded-2xl flex items-center justify-center shadow-xl mb-4">
        <CalendarCheck size={32}/>
      </div>
      <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Confirmed!</h2>
      <p className="text-slate-500 text-xs font-medium mb-6 max-w-xs leading-relaxed">Consultation scheduled with {currentAdvisor?.name}.</p>
      <button onClick={onClose} className="w-full max-w-[140px] py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[8px] active:scale-95 transition-all shadow-lg">Done</button>
    </div>
  );

  const inputClass = "w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#075e54] transition-all shadow-sm";

  return (
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden font-jakarta h-[100dvh]">
      <header className="px-4 pt-8 pb-3 flex items-center justify-between border-b border-slate-100 bg-white z-50 shrink-0">
        <button onClick={onClose} className="p-1.5 text-slate-950 active:scale-90"><X size={20}/></button>
        <div className="flex flex-col items-center flex-1">
           <div className="flex gap-1 mb-1">
              {[1,2,3,4].map(i => (
                <div key={i} className={`h-0.5 rounded-full transition-all duration-500 ${i === step ? 'w-4 bg-[#075e54]' : 'w-1 bg-slate-100'}`}></div>
              ))}
           </div>
           <p className="text-[6px] font-black uppercase text-slate-400 tracking-[0.2em]">Step {step}/4</p>
        </div>
        <div className="w-8"></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fdfdff] ios-scroll min-h-0">
        {error && <div className="p-2 bg-red-50 text-red-600 text-[8px] font-black uppercase flex items-center gap-2 rounded-lg border border-red-100">{error}</div>}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-2">
             <h3 className="text-sm font-black text-slate-900 uppercase mb-3 text-center">Consultant</h3>
             <div className="grid grid-cols-1 gap-2">
                {ADVISORS.map(a => (
                  <button key={a.id} onClick={() => { setFormData({...formData, advisorId: a.id}); setStep(2); }} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white active:scale-[0.98] transition-all group shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-[#075e54] text-white flex items-center justify-center font-black text-sm shadow-sm">{a.initials}</div>
                    <div className="flex-1 text-left">
                      <h4 className="font-black uppercase text-[10px] text-slate-900 mb-0.5">{a.name}</h4>
                      <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest truncate">{a.languages.join(' • ')}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-200" />
                  </button>
                ))}
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-2">
             <h3 className="text-sm font-black text-slate-900 uppercase mb-3 text-center">Mode</h3>
             <div className="space-y-2">
                {[
                  { m: 'Google Meet', i: Video, desc: 'Online' },
                  { m: 'In-person Office', i: MapPin, desc: 'Dubai Office' }
                ].map((item) => (
                  <button key={item.m} onClick={() => { setFormData({...formData, mode: item.m as ConsultationMode}); setStep(3); }} className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white active:scale-[0.98] transition-all text-left group shadow-sm">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50 text-[#075e54] group-hover:bg-[#075e54] group-hover:text-white transition-all"><item.i size={20}/></div>
                    <div className="flex-1">
                      <p className="font-black uppercase text-[10px] text-slate-900">{item.m}</p>
                      <p className="text-[6px] font-bold text-slate-400 uppercase tracking-widest">{item.desc}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-200" />
                  </button>
                ))}
             </div>
             <button onClick={() => setStep(1)} className="mt-6 w-full text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center justify-center gap-1 active:text-[#075e54] transition-colors"><ChevronLeft size={10}/> Back</button>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-2 pb-10">
             <h3 className="text-sm font-black text-slate-900 uppercase mb-3 text-center">Schedule</h3>
             <div className="bg-slate-900 rounded-2xl p-4 text-white mb-4 shadow-lg scale-95 origin-top">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-black uppercase text-[9px] tracking-widest text-emerald-400">{viewDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</p>
                  <div className="flex gap-0.5">
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()-1)))} className="p-1 hover:bg-white/10 rounded"><ChevronLeft size={14}/></button>
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()+1)))} className="p-1 hover:bg-white/10 rounded"><ChevronRight size={14}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((d, i) => d ? (
                    <button key={i} onClick={() => { setFormData({...formData, date: getLocalDateString(d)}); setAvailableSlots([]); }} className={`aspect-square rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ${formData.date === getLocalDateString(d) ? 'bg-[#075e54] text-white' : 'text-slate-400 hover:text-white'}`}>
                        {d.getDate()}
                      </button>
                  ) : <div key={i}/>)}
                </div>
             </div>
             <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {availableSlots.map((s, i) => (
                    <button key={i} onClick={() => setFormData({...formData, time: s.time})} className={`py-2 rounded-lg border font-bold text-[9px] uppercase transition-all ${formData.time === s.time ? 'border-[#075e54] bg-[#075e54] text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
                      {new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </button>
                  ))}
                </div>
             </div>
             {formData.time && <button onClick={() => setStep(4)} className="w-full mt-4 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-[0.2em] shadow-lg">Continue</button>}
             <button onClick={() => setStep(2)} className="mt-4 w-full text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center justify-center gap-1 active:text-[#075e54] transition-colors"><ChevronLeft size={10}/> Back</button>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right-2">
             <h3 className="text-sm font-black text-slate-900 uppercase mb-4 text-center">Verify Info</h3>
             <div className="space-y-3">
                <div className="space-y-1">
                   <label className="text-[7px] font-black uppercase text-slate-600 tracking-widest ml-1">Full Name</label>
                   <input type="text" placeholder="Your name as per passport" className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                   <label className="text-[7px] font-black uppercase text-slate-600 tracking-widest ml-1">Phone Number</label>
                   <input type="tel" placeholder="+971..." className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="space-y-1">
                   <label className="text-[7px] font-black uppercase text-slate-600 tracking-widest ml-1">Nationality</label>
                   <select className={`${inputClass} appearance-none`} value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})}>
                     <option value="">Select Nationality</option>
                     {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[7px] font-black uppercase text-slate-600 tracking-widest ml-1">Email Address</label>
                   <input type="email" placeholder="email@example.com" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
             </div>
             <button disabled={loading} onClick={handleBook} className="w-full mt-6 py-4 bg-[#075e54] text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all">{loading ? <Loader2 className="animate-spin" size={16}/> : "Confirm Booking"}</button>
             <button onClick={() => setStep(3)} className="mt-4 w-full text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center justify-center gap-1 active:text-[#075e54] transition-colors"><ChevronLeft size={10}/> Back</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingForm;
