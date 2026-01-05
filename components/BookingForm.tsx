
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
      <div className="w-24 h-24 bg-green-500 text-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-8 vibrant-shadow">
        <CalendarCheck size={48}/>
      </div>
      <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-4">Confirmed!</h2>
      <p className="text-slate-500 font-medium mb-10 max-w-xs">Your consultation with {currentAdvisor?.name} has been scheduled successfully.</p>
      
      <div className="w-full max-w-sm bg-slate-50 border border-slate-100 rounded-[2rem] p-6 mb-10 text-left">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Date</p>
            <p className="font-bold text-slate-900">{formattedSelectedDate}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Time (GST)</p>
            <p className="font-bold text-slate-900">{new Date(formData.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
          </div>
        </div>
      </div>

      <button onClick={onClose} className="w-full max-w-[200px] py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-xl">
        Done
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden font-jakarta h-[100dvh]">
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
           <p className="text-[7px] font-black uppercase text-slate-400 tracking-[0.3em]">{["Select Expert", "Select Mode", "Pick Time", "Your Info"][step-1]}</p>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8 space-y-8 bg-[#fdfdff] ios-scroll min-h-0">
        {error && (
          <div className="p-4 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 rounded-2xl border border-red-100 animate-in shake">
            <AlertCircle size={18} className="shrink-0" /> 
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-24">
             <h3 className="text-2xl font-black text-slate-900 uppercase mb-8 text-center">Consultant</h3>
             <div className="grid grid-cols-1 gap-4">
                {ADVISORS.map(a => (
                  <button 
                    key={a.id} 
                    onClick={() => { setFormData({...formData, advisorId: a.id}); setStep(2); }} 
                    className="flex items-center gap-4 p-5 rounded-[2rem] border-2 border-slate-100 bg-white hover:border-indigo-600 active:scale-[0.98] transition-all group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center font-black text-lg group-hover:bg-indigo-600 transition-colors">
                      {a.initials}
                    </div>
                    <div className="flex-1 text-left">
                      <h4 className="font-black uppercase text-sm text-slate-900 mb-1">{a.name}</h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{a.languages.join(' • ')}</p>
                    </div>
                    <ChevronRight size={20} className="text-slate-200" />
                  </button>
                ))}
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-24">
             <h3 className="text-2xl font-black text-slate-900 uppercase mb-8 text-center">Consultation Mode</h3>
             <div className="space-y-4">
                {[
                  { m: 'Google Meet', i: Video, desc: 'Online Video Call' },
                  { m: 'In-person Office', i: MapPin, desc: 'Dubai Office Visit' }
                ].map((item) => (
                  <button key={item.m} onClick={() => { setFormData({...formData, mode: item.m as ConsultationMode}); setStep(3); }} className="w-full flex items-center gap-5 p-6 rounded-[2rem] border-2 border-slate-100 bg-white hover:border-indigo-600 active:scale-[0.98] transition-all text-left group">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-50 text-slate-900 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"><item.i size={28}/></div>
                    <div className="flex-1">
                      <p className="font-black uppercase text-sm text-slate-900">{item.m}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{item.desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-200" />
                  </button>
                ))}
             </div>
             <button onClick={prevStep} className="mt-10 w-full text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center justify-center gap-2">
                <ChevronLeft size={16}/> Back to Experts
             </button>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-32">
             <h3 className="text-2xl font-black text-slate-900 uppercase mb-8 text-center">Calendar</h3>
             
             <div className="bg-slate-950 rounded-[2.5rem] p-8 text-white mb-8 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <p className="font-black uppercase text-[12px] tracking-widest text-indigo-400">{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()-1)))} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"><ChevronLeft size={20}/></button>
                    <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth()+1)))} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"><ChevronRight size={20}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-3 text-center mb-4">
                  {['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[10px] font-black text-slate-500 uppercase">{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-3">
                  {calendarDays.map((d, i) => d ? (
                    <button key={i} onClick={() => { setFormData({...formData, date: getLocalDateString(d)}); setAvailableSlots([]); }} className={`aspect-square rounded-xl text-[14px] font-black flex items-center justify-center transition-all ${formData.date === getLocalDateString(d) ? 'bg-indigo-600 text-white scale-110 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        {d.getDate()}
                      </button>
                  ) : <div key={i}/>)}
                </div>
             </div>

             <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-center mb-4">Available Slots</p>
                {slotsLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="animate-spin text-indigo-600" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Checking Availability...</p>
                  </div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {availableSlots.map((s, i) => (
                      <button key={i} onClick={() => setFormData({...formData, time: s.time})} className={`py-5 rounded-2xl border-2 font-black text-[12px] uppercase tracking-widest transition-all ${formData.time === s.time ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg scale-[1.02]' : 'border-slate-100 bg-white text-slate-900 hover:border-slate-200'}`}>
                        {new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 px-6 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">No sessions found for this date.<br/>Try another date.</p>
                  </div>
                )}
             </div>

             {formData.time && (
               <button onClick={() => setStep(4)} className="w-full mt-10 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-[0.3em] shadow-xl animate-in fade-in slide-in-from-bottom-4">
                 Continue
               </button>
             )}

             <button onClick={prevStep} className="mt-10 w-full text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center justify-center gap-2 pb-10">
                <ChevronLeft size={16}/> Back to Mode
             </button>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in slide-in-from-right-4 pb-48">
             <h3 className="text-2xl font-black text-slate-900 uppercase mb-8 text-center">Your Profile</h3>
             <div className="space-y-5">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Name</p>
                  <input 
                    type="text" 
                    placeholder="Enter your name" 
                    className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.75rem] font-bold text-sm outline-none focus:border-indigo-600 transition-all"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone Number</p>
                  <input 
                    type="tel" 
                    placeholder="+971 -- --- ----" 
                    className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.75rem] font-bold text-sm outline-none focus:border-indigo-600 transition-all"
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Nationality</p>
                  <select 
                    className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.75rem] font-bold text-sm outline-none focus:border-indigo-600 appearance-none transition-all"
                    value={formData.nationality} 
                    onChange={e => setFormData({...formData, nationality: e.target.value})}
                  >
                    <option value="" disabled>Select Country</option>
                    {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Email Address</p>
                  <input 
                    type="email" 
                    placeholder="name@email.com" 
                    className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.75rem] font-bold text-sm outline-none focus:border-indigo-600 transition-all"
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                  />
                </div>
             </div>

             <button 
               disabled={loading || !formData.name || !formData.email || !formData.phone || !formData.nationality} 
               onClick={handleBook} 
               className="w-full mt-10 py-6 bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] disabled:opacity-30 shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3"
             >
                {loading ? <Loader2 className="animate-spin" size={20}/> : "Confirm Booking"}
             </button>

             <button onClick={prevStep} className="mt-8 w-full text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center justify-center gap-2">
                <ChevronLeft size={16}/> Back to Calendar
             </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingForm;
