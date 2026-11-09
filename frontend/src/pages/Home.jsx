import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Leaf, Users2, Shield, ChevronDown, ChevronUp, ArrowRight, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { HelpBanner, InfoTip } from '../components/HelpSystem';
import api from '../services/api';
import SectorPicker from '../components/SectorPicker';
import SectorKpiTiles from '../components/SectorKpiTiles';
import { useT } from '../i18n';

export default function Home() {
  const { user } = useAuth();
  const { t } = useT();

  const PILLARS = [
    {
      key: 'E', title: t('home.environmental'), icon: Leaf, color: 'esg-e', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200',
      description: t('home.envDesc'),
      items: [
        { id: 'ENV', name: t('home.climateEmissions'), desc: t('home.climateEmissionsDesc'), path: '/dashboard/E/environmental-1', active: true, standards: 'ESRS E1 · GRI 305 · TCFD · CDP' },
        { id: 'ENV', name: t('home.pollutionWaste'), desc: t('home.pollutionWasteDesc'), badge: t('home.badgeUnderDevelopment'), standards: 'ESRS E2 · GRI 306' },
        { id: 'ENV', name: t('home.waterResources'), desc: t('home.waterResourcesDesc'), path: '/dashboard/E/environmental-3', active: true, standards: 'ESRS E3 · GRI 303' },
        { id: 'ENV', name: t('home.biodiversity'), desc: t('home.biodiversityDesc'), path: '/dashboard/E/environmental-4', active: true, standards: 'ESRS E4 · GRI 101' },
        { id: 'ENV', name: t('home.circularEconomy'), desc: t('home.circularEconomyDesc'), badge: t('home.badgeUpgradeEnterprise'), standards: 'ESRS E5 · GRI 301' },
      ],
    },
    {
      key: 'S', title: t('home.social'), icon: Users2, color: 'esg-s', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200',
      description: t('home.socDesc'),
      items: [
        { id: 'SOC', name: t('home.workforceEmployees'), desc: t('home.workforceEmployeesDesc'), path: '/dashboard/S/social-1', active: true, standards: 'ESRS S1 · GRI 401-405 · SASB' },
        { id: 'SOC', name: t('home.supplyChainLabor'), desc: t('home.supplyChainLaborDesc'), badge: t('home.badgeUnderDevelopment'), standards: 'ESRS S2 · GRI 414' },
        { id: 'SOC', name: t('home.communityImpact'), desc: t('home.communityImpactDesc'), badge: t('home.badgeUnderDevelopment'), standards: 'ESRS S3 · GRI 413' },
        { id: 'SOC', name: t('home.consumerProtection'), desc: t('home.consumerProtectionDesc'), badge: t('home.badgeUpgradeEnterprise'), standards: 'ESRS S4 · GRI 416-418' },
      ],
    },
    {
      key: 'G', title: t('home.governance'), icon: Shield, color: 'esg-g', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
      description: t('home.govDesc'),
      items: [
        { id: 'GOV', name: t('home.boardLeadership'), desc: t('home.boardLeadershipDesc'), badge: t('home.badgeUpgradeEnterprise'), standards: 'ESRS G1 · GRI 405 · TCFD' },
        { id: 'GOV', name: t('home.ethicsCompliance'), desc: t('home.ethicsComplianceDesc'), badge: t('home.badgeUpgradeEnterprise'), standards: 'ESRS G1 · GRI 205-206' },
      ],
    },
  ];
  const [expanded, setExpanded] = useState({ E: true, S: true, G: false });
  const [standard, setStandard] = useState('');
  const [sectorStatus, setSectorStatus] = useState(null);
  const [showSectorPicker, setShowSectorPicker] = useState(false);

  useEffect(() => {
    api.getEsgStandard().then((d) => setStandard(d.standard)).catch(() => {});
    api.getCurrentSector().then(setSectorStatus).catch(() => {});
  }, []);

  const needsSectorPick = sectorStatus && !sectorStatus.selected;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('home.welcomeBack', { name: user?.firstName })}</h1>
        <p className="text-gray-500 mt-1">{t('home.subtitle')}</p>
      </div>

      <HelpBanner
        id="home-welcome"
        title={t('home.welcomeTitle')}
        variant="tip"
      >
        {t('home.welcomeBody')}
      </HelpBanner>

      {/* Sector pack onboarding — only shown if the company hasn't picked one yet. */}
      {needsSectorPick && (
        <div className="rounded-2xl border-2 border-brand-400 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950 dark:to-gray-900 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">{t('home.pickIndustry')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('home.sectorPickDesc')}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              onClick={() => setShowSectorPicker(false)}
              aria-label={t('common.dismiss')}
              style={{ display: showSectorPicker ? 'block' : 'none' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {showSectorPicker ? (
            <SectorPicker
              onSelect={async () => {
                const s = await api.getCurrentSector();
                setSectorStatus(s);
                setShowSectorPicker(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowSectorPicker(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              {t('home.chooseSector')}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Sector KPIs — shows industry-specific metrics from the active pack */}
      {sectorStatus?.selected && (
        <div className="card">
          <SectorKpiTiles />
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('home.creditsAvailable')}</span>
            <InfoTip title={t('home.creditsAvailable')}>{t('home.creditsTooltipFull')}</InfoTip>
          </div>
          <span className="text-2xl font-bold text-brand-700">{user?.company?.creditBalance ?? 0}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('home.activeModules')}</span>
            <InfoTip title={t('home.activeModules')}>{t('home.activeModulesTooltipFull')}</InfoTip>
          </div>
          <span className="text-2xl font-bold text-esg-e">{t('home.modulesCount')}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">{t('home.reportingStandard')}</span>
            <InfoTip title={t('home.reportingStandard')}>{t('home.reportingStandardTooltip')}</InfoTip>
          </div>
          <span className="text-2xl font-bold text-gray-700">{standard || '—'}</span>
        </div>
      </div>

      {/* ESG Pillars */}
      {PILLARS.map((pillar) => {
        const isExpanded = expanded[pillar.key];
        return (
          <div key={pillar.key} className={clsx('card border-l-4', pillar.borderColor)}>
            <button
              onClick={() => setExpanded((p) => ({ ...p, [pillar.key]: !p[pillar.key] }))}
              className="w-full flex items-center gap-3"
            >
              <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', pillar.bgColor)}>
                <pillar.icon className={clsx('w-5 h-5', `text-${pillar.color}`)} />
              </div>
              <div className="flex-1 text-left">
                <h2 className="font-semibold text-lg">{pillar.title}</h2>
                <p className="text-sm text-gray-500">{pillar.description}</p>
              </div>
              {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="mt-4 grid gap-3">
                {pillar.items.map((item, idx) => (
                  <div key={item.name + idx} className={clsx('flex items-center gap-3 p-3 rounded-lg border', item.active ? 'border-gray-200 hover:border-brand-300 hover:bg-brand-50/30' : 'border-gray-100 bg-gray-50')}>
                    <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0', item.active ? `${pillar.bgColor} text-${pillar.color}` : 'bg-gray-100 text-gray-400')}>
                      {item.id.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={clsx('font-medium text-sm', item.active ? 'text-gray-900' : 'text-gray-400')}>{item.name}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                      {item.standards && (
                        <p className="text-[10px] text-gray-300 mt-0.5">{item.standards}</p>
                      )}
                    </div>
                    {item.active ? (
                      <Link to={item.path} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium shrink-0">
                        {t('home.open')} <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500 shrink-0">{item.badge}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
