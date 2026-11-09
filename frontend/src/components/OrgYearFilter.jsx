import { useState, useEffect } from 'react';
import api from '../services/api';
import { InfoTip } from './HelpSystem';
import { useT } from '../i18n';

export default function OrgYearFilter({ filters, onChange }) {
  const { t } = useT();
  const [orgUnits, setOrgUnits] = useState([]);
  const [years, setYears] = useState([]);
  const [selected, setSelected] = useState([]);
  const [allSelected, setAllSelected] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    Promise.all([api.getOrgUnits(), api.getDataYears()]).then(([units, yrs]) => {
      setOrgUnits(units);
      // Include current filter year in the list if not already there
      const allYears = [...new Set([...(yrs || []), filters.year].filter(Boolean))].sort((a, b) => b - a);
      setYears(allYears.length > 0 ? allYears : [new Date().getFullYear()]);
      setInitialized(true);
    }).catch(() => {
      setYears([filters.year || new Date().getFullYear()]);
      setInitialized(true);
    });
  }, []);

  const toggleUnit = (id) => {
    let next;
    if (selected.includes(id)) {
      next = selected.filter((u) => u !== id);
    } else {
      next = [...selected, id];
    }
    setSelected(next);
    setAllSelected(next.length === 0);
    // Pass empty string when no specific units selected (= all units)
    onChange({ ...filters, orgUnits: next.length > 0 ? next.join(',') : '' });
  };

  const selectAll = () => {
    setSelected([]);
    setAllSelected(true);
    onChange({ ...filters, orgUnits: '' });
  };

  if (!initialized) return null;

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-1.5">
        <select
          className="input w-auto"
          value={filters.year || 'all'}
          onChange={(e) => onChange({ ...filters, year: e.target.value === 'all' ? null : parseInt(e.target.value) })}
        >
          <option value="all">{t('dashboard.allYears')}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <InfoTip>{t('dashboard.yearFilterTooltip')}</InfoTip>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={selectAll}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            allSelected
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-300'
          }`}
        >
          {t('dashboard.allUnits')}
        </button>
        {orgUnits.map((unit) => (
          <button
            key={unit.id}
            onClick={() => toggleUnit(unit.id)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              selected.includes(unit.id)
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-300'
            }`}
          >
            {unit.name}
          </button>
        ))}
      </div>
    </div>
  );
}
