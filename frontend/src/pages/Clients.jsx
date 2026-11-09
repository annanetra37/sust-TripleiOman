import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useFormat } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, Loading, PageHeader, useAsync } from '../components/ui';

/** Accountant / practitioner workspace (plan E12-01): every client, sorted by deadline risk. */
export default function Clients() {
  const { L, t, lang } = useI18n();
  const f = useFormat();
  const { switchOrg } = useAuth();
  const navigate = useNavigate();
  const { data } = useAsync(() => api.get('/orgs/clients-overview', { org: false }), []);
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader title={t('clients')} subtitle={L('All organisations you can access, sorted by deadline risk. Switch client without signing in again.', 'جميع المنشآت التي يمكنك الوصول إليها مرتبة حسب خطر المواعيد. بدّل العميل دون إعادة تسجيل الدخول.')} />
      <Card padded={false}>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>{L('Client', 'العميل')}</th><th>{L('Your role', 'دورك')}</th><th>{L('Risk', 'الخطر')}</th><th>{L('Overdue', 'متأخر')}</th><th>{L('Next deadline', 'الموعد القادم')}</th><th /></tr></thead>
          <tbody>{data.map((c) => (
            <tr key={c.organisation.id}>
              <td><div className="font-medium">{L(c.organisation.legalNameEn, c.organisation.legalNameAr || c.organisation.legalNameEn)}</div><div className="font-mono text-xs text-slate-500">{c.organisation.vatNumber}</div></td>
              <td><Badge>{t(c.role)}</Badge></td>
              <td><Badge tone={c.risk === 'HIGH' ? 'red' : c.risk === 'MEDIUM' ? 'amber' : 'green'}>{c.risk === 'HIGH' ? L('High', 'مرتفع') : c.risk === 'MEDIUM' ? L('Medium', 'متوسط') : L('Low', 'منخفض')}</Badge></td>
              <td className="num">{c.overdue}</td>
              <td className="text-sm">{c.next ? <>{lang === 'ar' ? c.next.titleAr || c.next.title : c.next.title}<div className="text-xs text-slate-500">{f.date(c.next.dueDate)}</div></> : '—'}</td>
              <td className="text-end"><button type="button" className="btn-secondary btn-sm" onClick={async () => { await switchOrg(c.organisation.id); navigate('/app'); }}>{L('Open', 'فتح')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
