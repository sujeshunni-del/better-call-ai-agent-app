
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

  // Step 1 & 2 transition: Resolve Event Type ID from Cal.com
  useEffect(() => {
    const resolveEventType = async () => {
      if (!currentAdvisor || !formData.mode) return;
      const slug = formData.mode === 'Google Meet' ? currentAdvisor.meetSlug : currentAdvisor.officeSlug;
      try {
        setSlotsLoading(true);
        const res = await fetch(`https://api.cal.com/v1/event-types?apiKey=${currentAdvisor.calApiKey}`);
        if (!res.ok) throw new Error("Could not connect to booking server.");
        const data = await res.json();
        const eventTypes = data.event_types || [];
        const match = eventTypes.find((et: any) => et.slug === slug) || eventTypes[0];
        if (match) {
          setResolvedEventTypeId(match.id);
        } else {
          throw new Error("Service unavailable for this advisor.");
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
      if (!response.ok) throw new Error(`Slot fetch failed: ${response.status}`);
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
      setError(`No slots found for this date.`);
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
        setError("Complete all fields to verify.");
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
          description: `Nationality: ${formData.nationality}\nPhone: ${formData.phone}\nMode: ${formData.mode}`,
          responses: { 
            name: formData.name, 
            email: formData.email,
            location: {
              value: formData.mode === 'Google Meet' ? 'integrations:google:meet' : 'inPerson',
              optionValue: formData.mode === 'Google Meet' ? '' : COMPANY_INFO.address
            }
          },
          metadata: {
            phone: formData.phone,
            nationality: formData.nationality
          }
        })
      });
      if (res.ok) {
        setIsSuccess(true);
      } else {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to book slot.");
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

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  if (isSuccess) return (
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col items-center justify-center p-8 text-center animate-in zoom-in duration-300 font-jakarta h-[100dvh]">
      <div className="w-20 h-20 bg-green-500 text-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-6 vibrant-shadow">
        <CalendarCheck size={40}/>
      </div>
      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Confirmed!</h2>
      <p className="text-slate-500 text-sm font-medium mb-8 max-w-xs leading-relaxed">Your consultation with {currentAdvisor?.name} has been scheduled successfully.</p>
      
      <div className="w-full max-w-xs bg-slate-50 border border-slate-100 rounded-[1.5rem] p-5 mb-8 text-left shadow-sm">
        <div className="space-y-3">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Date</p>
            <p className="font-bold text-slate-900 text-sm">{formattedSelectedDate}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Time (GST)</p>
            <p className="font-bold text-slate-900 text-sm">{new Date(formData.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
          </div>
        </div>
      </div>

      <button onClick={onClose} className="w-full max-w-[180px] py-4 bg-slate-900 text-white rounded-[1.25rem] font-black uppercase tracking-widest text-[9px] active:scale-95 transition-all shadow-xl">
        Done
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden font-jakarta h-[100dvh]">
      <header className="px-5 pt-12 pb-3 flex items-center justify-between border-b border-slate-100 bg-white z-50 shrink-0">
        <button onClick={onClose} className="p-2 -ml-2 text-slate-950 active:scale-90">
          <X size={24}/>
        </button>
        <div className="flex flex-col items-center flex-1">
           <div className="flex gap-1 mb-1.5">
              {[1,2,3,4].map(i => (
                <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === step ? 'w-5 bg-indigo-600' : i < step ? 'w-1.5 bg-indigo-200' : 'w-1.5 bg-slate-100'}`}></div>
              ))}
           </div>
           <p className="text-[7px] font-black uppercase text-slate-400 tracking-[0.3em]">{["Expert", "Mode", "Time", "Details"][step-1]}</p>
        </div>
        <div className="w-8"></div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5 space-y-6 bg-[#fdfdff] ios-scroll min-h-0">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-2 rounded-xl border border-red-100 animate-in shake">
            <AlertCircle size={14} className="shrink-0" /> 
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-20">
             <h3 className="text-xl font-black text-slate-900 uppercase mb-5 text-center">Select Consultant</h3>
             <div className="grid grid-cols-1 gap-3">
                {ADVISORS.map(a => (
                  <button 
                    key={a.id} 
                    onClick={() => { setFormData({...formData, advisorId: a.id}); setStep(2); }} 
                    className="flex items-center gap-4 p-4 rounded-[1.5rem] border border-slate-200 bg-white hover:border-indigo-600 active:scale-[0.98] transition-all group shadow-sm"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex items-center justify-center font-black text-base group-hover:bg-indigo-600 transition-colors">
                      {a.initials}
                    </div>
                    <div className="flex-1 text-left">
                      <h4 className="font-black uppercase text-xs text-slate-900 mb-0.5">{a.name}</h4>
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{a.languages.join(' • ')}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-200" />
                  </button>
                ))}
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-20">
             <h3 className="text-xl font-black text-slate-900 uppercase mb-5 text-center">Consultation Mode</h3>
             <div className="space-y-3">
                {[
                  { m: 'Google Meet', i: Video, desc: 'Online Video Call' },
                  { m: 'In-person Office', i: MapPin, desc: 'Dubai Office Visit' }
                ].map((item) => (
                  <button key={item.m} onClick={() => { setFormData({...formData, mode: item.m as ConsultationMode}); setStep(3); }} className="w-full flex items-center gap-4 p-4 rounded-[1.5rem] border border-slate-200 bg-white hover:border-indigo-600 active:scale-[0.98] transition-all text-left group shadow-sm">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 text-slate-900 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"><item.i size={24}/></div>
                    <div className="flex-1">
                      <p className="font-black uppercase text-xs text-slate-900">{item.m}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{item.desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-200" />
                  </button>
                ))}
             </div>
             <button onClick={prevStep} className="mt-8 w-full text-[9px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center justify-center gap-2">
                <ChevronLeft size={14}/> Back
             </button>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-24">
             <h3 className="text-xl font-black text-slate-900 uppercase mb-5 text-center">Pick a Date & Time</h3>
             
             <div className="bg-slate-900 rounded-[2rem] p-5 text-white mb-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <p className="font-black uppercase text-[11px] tracking-widest text-indigo-300">{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()-1)))} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"><ChevronLeft size={16}/></button>
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()+1)))} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"><ChevronRight size={16}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2 text-center mb-2">
                  {['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[9px] font-black text-slate-500 uppercase">{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((d, i) => d ? (
                    <button key={i} onClick={() => { setFormData({...formData, date: getLocalDateString(d)}); setAvailableSlots([]); }} className={`aspect-square rounded-lg text-[12px] font-bold flex items-center justify-center transition-all ${formData.date === getLocalDateString(d) ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
                        {d.getDate()}
                      </button>
                  ) : <div key={i}/>)}
                </div>
             </div>

             <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] text-center mb-3">Available Slots</p>
                {slotsLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Loader2 className="animate-spin text-indigo-600" size={20} />
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Loading...</p>
                  </div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {availableSlots.map((s, i) => (
                      <button key={i} onClick={() => setFormData({...formData, time: s.time})} className={`py-2.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider transition-all ${formData.time === s.time ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' : 'border-slate-200 bg-white text-slate-900 hover:border-indigo-300'}`}>
                        {new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 px-6 bg-slate-50 rounded-[1.5rem] border border-dashed border-slate-200">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">No slots available.<br/>Select another date.</p>
                  </div>
                )}
             </div>

             {formData.time && (
               <button onClick={() => setStep(4)} className="w-full mt-8 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.3em] shadow-lg animate-in fade-in slide-in-from-bottom-2">
                 Continue
               </button>
             )}

             <button onClick={prevStep} className="mt-8 w-full text-[9px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center justify-center gap-2 pb-6">
                <ChevronLeft size={14}/> Back
             </button>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-32">
             <h3 className="text-xl font-black text-slate-900 uppercase mb-6 text-center">Your Details</h3>
             <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-3">Full Name</p>
                  <input 
                    type="text" 
                    placeholder="Enter your name" 
                    className="w-full p-4 bg-white border border-slate-200 rounded-[1.25rem] font-bold text-sm outline-none focus:border-indigo-600 transition-all placeholder:text-slate-300"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-3">Phone Number</p>
                  <input 
                    type="tel" 
                    placeholder="+971 -- --- ----" 
                    className="w-full p-4 bg-white border border-slate-200 rounded-[1.25rem] font-bold text-sm outline-none focus:border-indigo-600 transition-all placeholder:text-slate-300"
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-3">Nationality</p>
                  <select 
                    className="w-full p-4 bg-white border border-slate-200 rounded-[1.25rem] font-bold text-sm outline-none focus:border-indigo-600 appearance-none transition-all text-slate-900"
                    value={formData.nationality} 
                    onChange={e => setFormData({...formData, nationality: e.target.value})}
                  >
                    <option value="" disabled>Select Country</option>
                    {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-3">Email Address</p>
                  <input 
                    type="email" 
                    placeholder="name@email.com" 
                    className="w-full p-4 bg-white border border-slate-200 rounded-[1.25rem] font-bold text-sm outline-none focus:border-indigo-600 transition-all placeholder:text-slate-300"
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                  />
                </div>
             </div>

             <button 
               disabled={loading || !formData.name || !formData.email || !formData.phone || !formData.nationality} 
               onClick={handleBook} 
               className="w-full mt-8 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] disabled:opacity-30 shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
             >
                {loading ? <Loader2 className="animate-spin" size={18}/> : "Confirm Booking"}
             </button>

             <button onClick={prevStep} className="mt-6 w-full text-[9px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center justify-center gap-2">
                <ChevronLeft size={14}/> Back
             </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingForm;
