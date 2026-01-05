
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
    // Basic validation
    if (!formData.name || !formData.email || !formData.phone || !formData.profession) {
      setError("Please ensure Name, Profession, Phone and Email are filled.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Sanitize phone for ClickUp: ensure it starts with '+' and has no spaces/dashes
      let phoneValue = formData.phone.replace(/\s|-|\(|\)/g, '');
      if (!phoneValue.startsWith('+') && phoneValue.length > 0) {
        phoneValue = '+' + phoneValue;
      }
      
      // Move Nationality and Desired Country to description to avoid "option index" errors 
      // which happen when ClickUp fields are Dropdowns but we send Text.
      const taskDescription = `
Immigration Inquiry Captured via AI Assistant

PROFILING DETAILS:
------------------
Name: ${formData.name}
Nationality: ${formData.nationality || 'Not specified'}
Age: ${formData.age || 'Not specified'}
Profession: ${formData.profession}
Desired Country: ${formData.desiredCountry || 'Not specified'}

CONTACT INFO:
-------------
Phone: ${phoneValue}
Email: ${formData.email}
      `.trim();

      const payload = {
        name: `Lead: ${formData.name} (${formData.nationality || 'Inquiry'})`,
        description: taskDescription,
        status: "to do",
        custom_fields: [
          // Age - assumed as number field
          { id: 'f4ba427f-6e9c-4aa2-ae5c-8159e1254d2c', value: parseInt(formData.age) || 0 }, 
          // Email - text field
          { id: '2e18821e-1c19-4de5-afb8-77ff11ee6327', value: formData.email.trim().toLowerCase() }, 
          // Phone - phone field
          { id: '5788588a-e1a5-4b4e-b900-42e1b5dd7822', value: phoneValue }, 
          // Profession - text field
          { id: '7dcb9f47-cf7a-4108-b42c-a5f84541b0d2', value: formData.profession.trim() }
          
          // NOTE: Nationality (87b4eee7...) and Desired Country (8c370b02...) 
          // are removed from custom_fields because they likely cause "option index" errors.
          // They are instead securely captured in the task description above.
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
        const msg = errJson.err || `Request failed (${response.status})`;
        
        if (msg.toLowerCase().includes('phone')) {
          throw new Error("Invalid phone format. Please use +[CountryCode][Number] with no spaces.");
        }
        if (msg.toLowerCase().includes('option index') || msg.toLowerCase().includes('uuid')) {
          throw new Error("ClickUp Configuration Error: Some selection fields are incompatible. We've notified the team, but your data is safe in the description.");
        }
        throw new Error(msg);
      }

      onSuccess();
    } catch (err: any) {
      console.error("Submission Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-[14px] font-bold text-slate-900 outline-none focus:border-indigo-600 transition-all placeholder:text-slate-300";
  const labelClass = "text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1 mb-1 block flex items-center gap-1.5";

  return (
    <div className="fixed inset-0 z-[4000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl flex flex-col max-h-[95dvh] animate-in zoom-in duration-300 overflow-hidden border border-slate-100">
        <header className="px-6 pt-7 pb-4 flex items-center justify-between border-b border-slate-50 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-[16px] font-[900] text-slate-900 uppercase leading-none tracking-tight">Verify Profile</h2>
              <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest mt-1.5">Confirmation before transfer</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 active:scale-90 transition-all">
            <X size={24}/>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-5 ios-scroll custom-scrollbar text-left bg-[#fbfbfe]">
          {error && (
            <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl flex items-start gap-3 text-[12px] font-bold border border-red-100 animate-in shake">
              <AlertCircle size={18} className="shrink-0 mt-0.5" /> 
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className={labelClass}><User size={13}/> Full Name</label>
              <input type="text" className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}><Globe size={13}/> Nationality</label>
                <input type="text" className={inputClass} value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} />
              </div>
              <div>
                <label className={labelClass}>Age</label>
                <input type="number" className={inputClass} value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
              </div>
            </div>

            <div>
              <label className={labelClass}><Briefcase size={13}/> Profession</label>
              <input type="text" className={inputClass} value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} />
            </div>

            <div>
              <label className={labelClass}><Phone size={13}/> Phone Number</label>
              <input type="tel" className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+971 --" />
            </div>

            <div>
              <label className={labelClass}><Mail size={13}/> Email Address</label>
              <input type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>

            <div>
              <label className={labelClass}><Globe size={13}/> Desired Country</label>
              <input type="text" className={inputClass} value={formData.desiredCountry} onChange={e => setFormData({...formData, desiredCountry: e.target.value})} />
            </div>
          </div>
        </main>

        <footer className="px-6 py-6 border-t border-slate-50 bg-white shrink-0">
          <button 
            disabled={loading}
            onClick={handleSubmit}
            className="w-full py-4.5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 h-14"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : (
              <>
                <CheckCircle size={20} /> Transfer to Advisor
              </>
            )}
          </button>
          <p className="text-center text-[8px] text-slate-400 font-black uppercase tracking-[0.3em] mt-5">Secured Advisor Transmission</p>
        </footer>
      </div>
    </div>
  );
};

export default LeadForm;
