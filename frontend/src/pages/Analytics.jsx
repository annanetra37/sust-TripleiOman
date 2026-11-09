import { useState } from 'react';
import S1Dashboard from './S1Dashboard';
import E1Dashboard from './E1Dashboard';
import SectorKpiTiles from '../components/SectorKpiTiles';
import { useT } from '../i18n';

export default function Analytics() {
  const { t } = useT();
  const [view, setView] = useState('environmental');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'environmental' ? 'bg-white shadow-sm text-esg-e' : 'text-gray-500'}`}
            onClick={() => setView('environmental')}
          >{t('analytics.environmental')}</button>
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'social' ? 'bg-white shadow-sm text-esg-s' : 'text-gray-500'}`}
            onClick={() => setView('social')}
          >{t('analytics.social')}</button>
        </div>
      </div>

      {/* Sector-specific KPI tiles — shows industry KPIs from the active pack */}
      <div className="card">
        <SectorKpiTiles />
      </div>

      {view === 'environmental' ? <E1Dashboard /> : <S1Dashboard />}
    </div>
  );
}
