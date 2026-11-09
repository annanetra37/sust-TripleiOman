import { useState } from 'react';
import { Send, BookOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Alert, Card, PageHeader, Spinner, useAsync } from '../components/ui';

export default function Assistant() {
  const { L, lang } = useI18n();
  const lib = useAsync(() => api.get('/assistant/library', { org: false }), []);
  const [q, setQ] = useState('');
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const ask = async (question) => {
    if (!question.trim()) return;
    setChat((c) => [...c, { role: 'user', text: question }]); setQ(''); setBusy(true);
    try { const r = await api.post('/assistant/ask', { question, lang }, { org: false }); setChat((c) => [...c, { role: 'bot', ...r }]); } catch (x) { setChat((c) => [...c, { role: 'bot', answer: x.message, citations: [] }]); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <PageHeader title={L('Tax assistant', 'المساعد الضريبي')} subtitle={L('Answers come only from our curated library of Omani tax laws, regulations and TaxOman guidance — every answer cites its source, and it says so when it is not sure.', 'الإجابات من مكتبتنا المعتمدة للقوانين واللوائح العُمانية وإرشادات جهاز الضرائب فقط — كل إجابة تذكر مصدرها، ويخبرك المساعد عندما لا يكون متأكداً.')} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="min-h-[300px] space-y-4">
            {chat.length === 0 && <p className="text-sm text-slate-500">{L('Ask in English or Arabic, e.g. "When must I register for VAT?"', 'اسأل بالعربية أو الإنجليزية، مثل "متى يجب أن أسجل في ضريبة القيمة المضافة؟"')}</p>}
            {chat.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ms-auto max-w-[85%] rounded-2xl bg-brand-800 px-4 py-2 text-sm text-white">{m.text}</div>
            ) : (
              <div key={i} className="max-w-[90%] rounded-2xl bg-slate-100 px-4 py-3 text-sm">
                <div className="whitespace-pre-wrap">{m.answer}</div>
                {m.citations?.length > 0 && <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">{m.citations.map((c, j) => <div key={c.id}>[{j + 1}] {c.source}</div>)}</div>}
                {m.mode === 'declined' && <Alert tone="warn" className="mt-2">{L('Consider asking a licensed Omani tax adviser.', 'ننصح باستشارة مستشار ضريبي مرخص.')}</Alert>}
              </div>
            ))}
            {busy && <Spinner />}
          </div>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Ask a tax question…', 'اطرح سؤالاً ضريبياً…')} />
            <button className="btn-primary" disabled={busy}><Send className="h-4 w-4 rtl:rotate-180" /></button>
          </form>
        </Card>
        <Card title={<span className="flex items-center gap-2"><BookOpen className="h-4 w-4" />{L('Library topics', 'مواضيع المكتبة')}</span>}>
          <ul className="space-y-2 text-sm">{(lib.data || []).map((d) => <li key={d.id}><button type="button" className="text-start text-brand-700 hover:underline" onClick={() => ask(d.q)}>{d.q}</button><div className="text-xs text-slate-400">{d.source}</div></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
