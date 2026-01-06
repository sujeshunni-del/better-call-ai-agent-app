
import React, { useState } from 'react';
import { LeadData } from '../types';
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
  Globe
} from 'lucide-react';

interface LeadFormProps {
  initialData: Partial<LeadData>;
  onClose: () => void;
  onSuccess: () => void;
}

const CLICKUP_LIST_ID = '901814818029';
const CLICKUP_API_KEY = "pk_260468481_S4KLO3ZGV6P1PL1POHKXNS1LA5ISSG0P";

const LeadForm: React.FC<LeadFormProps> = ({ initialData, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<LeadData>({
    name: initialData.name || '',
    age: initialData.age || '',
    profession: initialData.profession || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    nationality: initialData.nationality || '',
    desiredCountry: initialData.desiredCountry || ''
  });

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.profession) {
      setError("Please fill in Name, Profession, Phone and Email.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Standardize phone format for ClickUp Phone field
      let phoneValue = formData.phone.replace(/\s|-|\(|\)/g, '');
      if (!phoneValue.startsWith('+') && phoneValue.length > 0) {
        phoneValue = '+' + phoneValue;
      }
      
      const taskDescription = `
--- AI CHAT LEAD CAPTURE ---
Name: ${formData.name}
Nationality: ${formData.nationality || 'Not provided'}
Age: ${formData.age || 'Not provided'}
Profession: ${formData.profession}
Desired Country: ${formData.desiredCountry || 'Not provided'}

--- CONTACT INFO ---
Mobile: ${phoneValue}
Email: ${formData.email}
      `.trim();

      const payload = {
        name: formData.name, // "name goes to clickup task name"
        description: taskDescription,
        status: "to do",
        custom_fields: [
          {
            id: "2e18821e-1c19-4de5-afb8-77ff11ee6327", // Email
            value: formData.email.trim().toLowerCase()
          },
          {
            id: "5788588a-e1a5-4b4e-b900-42e1b5dd7822", // PHONE NUMBER
            value: phoneValue
          },
          {
            id: "7dcb9f47-cf7a-4108-b42c-a5f84541b0d2", // profession
            value: formData.profession.trim()
          },
          {
            id: "04f79e09-0302-4b20-a761-fa1ca94b1cc5", // age
            value: formData.age ? parseInt(formData.age) : null
          },
          {
            id: "87b4eee7-444f-4ec4-9882-441965757a68", // NATIONALITY
            value: formData.nationality.trim()
          },
          {
            id: "8c370b02-cfe5-48e2-879c-9ad34d3f25e7", // APPLY COUNTRY
            value: formData.desiredCountry.trim()
          }
        ]
      };

      const response = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': CLICKUP_API_KEY 
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.err || `Server Error (${response.status})`;
        
        // Detailed error logic for custom fields
        if (msg.toLowerCase().includes('option index') || msg.toLowerCase().includes('uuid')) {
          throw new Error("ClickUp Field Mismatch: Nationality or Apply Country are likely 'Dropdown' fields. To fix this, change them to 'Short Text' in ClickUp.");
        }
        throw new Error(msg);
      }

      onSuccess();
    } catch (err: any) {
      console.error("Submission Error:", err);
      setError(err.message || "Transmission failed. Please check your internet or try again.");
    } finally {
      setLoading(false);
    }
  };

  // Compact styles
  const inputClass = "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-900 outline-none focus:border-[#075e54] transition-all placeholder:text-slate-300";
  const labelClass = "text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1 mb-0.5 block flex items-center gap-1";

  return (
    <div className="fixed inset-0 z-[4000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xs sm:max-w-sm rounded-[2rem] shadow-2xl flex flex-col max-h-[90dvh] animate-in zoom-in duration-300 overflow-hidden border border-slate-100">
        <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-slate-50 shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#075e54] text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-[14px] font-[900] text-slate-900 uppercase leading-none tracking-tight">Verify Profile</h2>
              <p className="text-[8px] font-black uppercase text-emerald-600 tracking-widest mt-1">Advisor Data Sync</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 active:scale-90 transition-all">
            <X size={20}/>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-4 space-y-3 ios-scroll custom-scrollbar text-left bg-[#fbfbfe]">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl flex items-start gap-2 text-[11px] font-bold border border-red-100 animate-in shake">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> 
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className={labelClass}><User size={12}/> Full Name</label>
              <input type="text" className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}><Globe size={12}/> Nationality</label>
                <input type="text" className={inputClass} value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} />
              </div>
              <div>
                <label className={labelClass}>Age</label>
                <input type="number" className={inputClass} value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
              </div>
            </div>

            <div>
              <label className={labelClass}><Briefcase size={12}/> Profession</label>
              <input type="text" className={inputClass} value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} />
            </div>

            <div>
              <label className={labelClass}><Phone size={12}/> Phone Number</label>
              <input type="tel" className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+971 --" />
            </div>

            <div>
              <label className={labelClass}><Mail size={12}/> Email Address</label>
              <input type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>

            <div>
              <label className={labelClass}><Globe size={12}/> Desired Country</label>
              <input type="text" className={inputClass} value={formData.desiredCountry} onChange={e => setFormData({...formData, desiredCountry: e.target.value})} />
            </div>
          </div>
        </main>

        <footer className="px-5 py-4 border-t border-slate-50 bg-white shrink-0">
          <button 
            disabled={loading}
            onClick={handleSubmit}
            className="w-full h-12 bg-[#075e54] text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : (
              <>
                <CheckCircle size={18} /> Sync with Advisor
              </>
            )}
          </button>
          <p className="text-center text-[7px] text-slate-400 font-black uppercase tracking-[0.3em] mt-3">Secured Advisor Data Transfer</p>
        </footer>
      </div>
    </div>
  );
};

export default LeadForm;
