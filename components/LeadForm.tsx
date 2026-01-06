import React, { useState } from 'react';
import { LeadData } from '../types';
import { NATIONALITIES, COUNTRY_CODES } from '../constants';
import { 
  X, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  FileText,
  User,
  Briefcase,
  Phone,
  Mail,
  Globe,
  Home,
  MapPin,
  Search,
  UserCheck
} from 'lucide-react';

interface LeadFormProps {
  initialData: Partial<LeadData>;
  onClose: () => void;
  onSuccess: (data: LeadData) => void;
  onIneligible?: () => void;
}

const CLICKUP_LIST_ID = '901814818029';
const CLICKUP_API_KEY = "pk_260468481_S4KLO3ZGV6P1PL1POHKXNS1LA5ISSG0P";

const DESIRED_COUNTRIES = [
  "Any (Europe)", "Poland", "Germany", "Finland", "Sweden", "Croatia", "Slovakia", "Czech Republic", "Italy", "France", "Latvia", "Netherlands", "Albania", "Serbia", "Montenegro"
];

const LeadForm: React.FC<LeadFormProps> = ({ initialData, onClose, onSuccess, onIneligible }) => {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [isIneligible, setIsIneligible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<LeadData>({
    name: initialData.name || '',
    age: initialData.age || '',
    profession: initialData.profession || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    nationality: initialData.nationality || '',
    desiredCountry: initialData.desiredCountry || 'Any (Europe)'
  });

  const handleNationalityChange = (nat: string) => {
    const code = COUNTRY_CODES[nat] || '';
    setFormData(prev => ({ 
      ...prev, 
      nationality: nat,
      phone: code 
    }));
  };

  const validateEligibility = () => {
    const ageValue = parseInt(formData.age);
    if (isNaN(ageValue) || ageValue < 21 || ageValue > 51) return false;
    const nat = formData.nationality.toUpperCase();
    if (!NATIONALITIES.includes(nat)) return false;
    return true;
  };

  const handleProfileLookup = async () => {
    if (!formData.name || !formData.phone || formData.phone.length < 5) {
      setError("Please enter your name and full phone number to check status.");
      return;
    }

    setSearching(true);
    setError(null);
    const cleanPhone = formData.phone.trim().replace(/[^\d+]/g, '');

    try {
      const response = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?include_closed=true`, {
        method: 'GET',
        headers: { 'Authorization': CLICKUP_API_KEY }
      });

      if (!response.ok) throw new Error("Connection error");

      const data = await response.json();
      const tasks = data.tasks || [];

      const existingTask = tasks.find((t: any) => {
        const nameMatch = t.name.toLowerCase().includes(formData.name.trim().toLowerCase());
        const phoneField = t.custom_fields?.find((cf: any) => cf.id === "5788588a-e1a5-4b4e-b900-42e1b5dd7822");
        const phoneMatch = phoneField?.value?.replace(/[^\d+]/g, '') === cleanPhone;
        return nameMatch && phoneMatch;
      });

      if (existingTask) {
        const getVal = (id: string) => existingTask.custom_fields?.find((cf: any) => cf.id === id)?.value || '';
        
        const foundData: LeadData = {
          name: existingTask.name,
          profession: getVal("410dd336-f23f-4893-859f-d04e420f6431"),
          email: getVal("2e18821e-1c19-4de5-afb8-77ff11ee6327"),
          age: getVal("04f79e09-0302-4b20-a761-fa1ca94b1cc5")?.toString() || '',
          phone: cleanPhone,
          nationality: getVal("4402d5e4-93b4-447e-8647-3417abf1a6e2"),
          desiredCountry: getVal("8c370b02-cfe5-48e2-879c-9ad34d3f25e7") || 'Any (Europe)'
        };

        setFormData(foundData);
        setIsNewUser(false);
        setTimeout(() => onSuccess(foundData), 800);
      } else {
        setIsNewUser(true);
      }
    } catch (err) {
      console.error("Lookup error:", err);
      setIsNewUser(true);
    } finally {
      setSearching(false);
    }
  };

  const attemptSync = async (payload: any) => {
    try {
      const response = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': CLICKUP_API_KEY 
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data, status: response.status };
    } catch (e) {
      return { ok: false, data: e, status: 500 };
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.age || !formData.nationality || !formData.profession || !formData.phone || !formData.email) {
      setError("Please fill in all details to proceed.");
      return;
    }

    if (!validateEligibility()) {
      setIsIneligible(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cleanPhone = formData.phone.trim().replace(/[^\d+]/g, '');
      const ageInt = parseInt(formData.age);
      
      const taskDescription = `
--- NEW APPLICANT PROFILE CAPTURE ---
Full Name: ${formData.name}
Profession: ${formData.profession}
Age: ${formData.age}
Nationality: ${formData.nationality}
Interested In: ${formData.desiredCountry}
Email: ${formData.email}
Phone: ${cleanPhone}
-------------------------------------
      `.trim();

      const basePayload = {
        name: formData.name.trim(),
        description: taskDescription,
      };

      const pass1Payload = {
        ...basePayload,
        custom_fields: [
          { id: "410dd336-f23f-4893-859f-d04e420f6431", value: formData.profession.trim() },
          { id: "2e18821e-1c19-4de5-afb8-77ff11ee6327", value: formData.email.trim().toLowerCase() },
          { id: "04f79e09-0302-4b20-a761-fa1ca94b1cc5", value: ageInt },
          { id: "5788588a-e1a5-4b4e-b900-42e1b5dd7822", value: cleanPhone },
          { id: "4402d5e4-93b4-447e-8647-3417abf1a6e2", value: formData.nationality.trim() },
          { id: "8c370b02-cfe5-48e2-879c-9ad34d3f25e7", value: formData.desiredCountry.trim() }
        ]
      };

      const firstTry = await attemptSync(pass1Payload);

      if (!firstTry.ok) {
        const pass2Payload = {
          ...basePayload,
          custom_fields: [
            { id: "410dd336-f23f-4893-859f-d04e420f6431", value: formData.profession.trim() },
            { id: "2e18821e-1c19-4de5-afb8-77ff11ee6327", value: formData.email.trim().toLowerCase() },
            { id: "04f79e09-0302-4b20-a761-fa1ca94b1cc5", value: ageInt },
            { id: "5788588a-e1a5-4b4e-b900-42e1b5dd7822", value: cleanPhone }
          ]
        };
        const secondTry = await attemptSync(pass2Payload);
        if (!secondTry.ok) {
           await attemptSync({ ...basePayload, custom_fields: [] });
        }
      }
      
      onSuccess(formData);
    } catch (err: any) {
      onSuccess(formData); 
    } finally {
      setLoading(false);
    }
  };

  if (isIneligible) {
    return (
      <div className="fixed inset-0 z-[4000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-xs rounded-[2rem] p-6 text-center shadow-2xl border border-slate-100">
          <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase leading-tight mb-2">Not Eligible</h2>
          <p className="text-slate-600 text-[10px] font-bold leading-relaxed mb-6 text-left">
            We currently only process applications for candidates aged 21-51 from our supported regions.
          </p>
          <button onClick={onIneligible} className="w-full h-11 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
            <Home size={14}/> Back to Home
          </button>
        </div>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-900 outline-none focus:border-[#075e54] transition-all placeholder:text-slate-400";
  const labelClass = "text-[7px] font-black uppercase text-slate-600 tracking-widest ml-1 mb-0.5 block flex items-center gap-1";

  return (
    <div className="fixed inset-0 z-[4000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xs rounded-[1.25rem] shadow-2xl flex flex-col max-h-[95dvh] animate-in zoom-in duration-300 overflow-hidden border border-slate-100">
        <header className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#075e54] text-white rounded-lg flex items-center justify-center shadow-lg">
              <FileText size={14} />
            </div>
            <div>
              <h2 className="text-[11px] font-[900] text-slate-900 uppercase leading-none tracking-tight">Profile Verification</h2>
              <p className="text-[6px] font-black uppercase text-emerald-700 tracking-widest mt-0.5">Current Vacancy Check</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 active:scale-90 transition-all">
            <X size={16}/>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-3 space-y-3 ios-scroll custom-scrollbar text-left bg-[#fdfdff]">
          {error && (
            <div className="p-2.5 bg-red-50 text-red-700 rounded-lg flex items-start gap-1.5 text-[9px] font-bold border border-red-100 animate-in shake">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> 
              <span>{error}</span>
            </div>
          )}

          {isNewUser === false && (
            <div className="p-3 bg-emerald-50 text-[#075e54] rounded-xl flex flex-col items-center gap-2 text-center animate-in zoom-in border border-emerald-100">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-[#075e54]">
                <UserCheck size={20} />
              </div>
              <p className="text-[11px] font-black uppercase tracking-tight">Welcome back, {formData.name}!</p>
              <p className="text-[8px] font-bold uppercase opacity-80">Your profile is already verified. Redirecting to advisor...</p>
              <Loader2 size={14} className="animate-spin mt-1 text-[#075e54]" />
            </div>
          )}

          {(isNewUser === null || isNewUser === true) && (
            <div className="space-y-3">
              <div className="space-y-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                <div>
                  <label className={labelClass}><User size={10}/> Full Name</label>
                  <input 
                    type="text" 
                    className={inputClass} 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="Full name as per Passport" 
                    disabled={searching || loading}
                  />
                </div>
                
                <div>
                  <label className={labelClass}><Phone size={10}/> Phone Number</label>
                  <div className="flex gap-1.5">
                    <select 
                      className="w-20 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-900 outline-none focus:border-[#075e54]"
                      onChange={e => {
                        const code = COUNTRY_CODES[e.target.value] || '';
                        setFormData({...formData, phone: code, nationality: e.target.value});
                      }}
                      value={formData.nationality}
                    >
                      <option value="">Code</option>
                      {NATIONALITIES.map(n => <option key={n} value={n}>{COUNTRY_CODES[n]} ({n.slice(0,3)})</option>)}
                    </select>
                    <input 
                      type="tel" 
                      className={inputClass} 
                      value={formData.phone} 
                      onChange={e => setFormData({...formData, phone: e.target.value})} 
                      placeholder="+..." 
                      disabled={searching || loading}
                    />
                  </div>
                </div>

                {isNewUser === null && (
                  <button 
                    onClick={handleProfileLookup}
                    disabled={searching || !formData.name || !formData.phone}
                    className="w-full h-10 bg-slate-900 text-white rounded-lg font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {searching ? <Loader2 size={12} className="animate-spin" /> : <><Search size={12}/> Check Status</>}
                  </button>
                )}
              </div>

              {isNewUser === true && (
                <div className="space-y-3 p-3 bg-white border border-emerald-100 rounded-xl animate-in slide-in-from-top duration-500 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 bg-[#075e54] text-white rounded flex items-center justify-center"><UserCheck size={10}/></div>
                    <p className="text-[9px] font-black uppercase text-[#075e54] tracking-tight">New Profile Required</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}><Globe size={10}/> Nationality</label>
                      <select className={inputClass} value={formData.nationality} onChange={e => handleNationalityChange(e.target.value)}>
                        <option value="">Select</option>
                        {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Age</label>
                      <input type="number" className={inputClass} value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} placeholder="21-51" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}><Briefcase size={10}/> Profession</label>
                    <input type="text" className={inputClass} value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} placeholder="Current job title" />
                  </div>

                  <div>
                    <label className={labelClass}><MapPin size={10}/> Preferred Destination</label>
                    <select className={inputClass} value={formData.desiredCountry} onChange={e => setFormData({...formData, desiredCountry: e.target.value})}>
                      {DESIRED_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}><Mail size={10}/> Email Address</label>
                    <input type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="example@email.com" />
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {(isNewUser === true) && (
          <footer className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
            <button 
              disabled={loading}
              onClick={handleSubmit}
              className="w-full h-11 bg-[#075e54] text-white rounded-lg font-black uppercase tracking-[0.1em] text-[9px] flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : (
                <>
                  <CheckCircle size={14} /> Verify & Start
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default LeadForm;
