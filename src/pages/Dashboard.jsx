import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits, fetchCompanyAggregate } from '../hooks/useData';
import { PageHeader, Kpi, useTheme } from '../components/primitives';
import { fmtMoney, canSeeField } from '../lib/permissions';

const YEAR = new Date().getFullYear();

export default function Dashboard() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits } = useOrgUnits();

  const [aggregates, setAggregates] = useState({});

  useEffect(() => {
    (async () => {
      const result = {};
      for (const c of companies) {
        result[c.id] = await fetchCompanyAggregate(c.id, YEAR);
      }
      setAggregates(result);
    })();
  }, [companies]);

  const totals = useMemo(() => {
    let allocated = 0, committed = 0, savings = 0, headcount = 0;
    for (const c of companies) {
      const ag = aggregates[c.id];
      if (!ag) continue;
      allocated += Number(ag.allocated || 0);
      committed += Number(ag.committed || 0);
      savings += Number(ag.savings || 0);
      headcount += Number(ag.headcount || 0);
    }
    return { allocated, committed, savings, headcount, remaining: allocated - committed };
  }, [companies, aggregates]);

  const showBudgets = canSeeField(profile, perms, 'see_budgets');
  const showSavings = canSeeField(profile, perms, 'see_savings');

  return (
    <div className="space-y-6">
      <PageHeader title={L.nav.dashboard} subtitle={`${L.year} ${YEAR}`} theme={theme} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {showBudgets && (
          <Kpi theme={theme} label={L.kpi.allocated} value={`${fmtMoney(totals.allocated, lang)} ${L.currency}`} accent="blue" />
        )}
        <Kpi theme={theme} label={L.kpi.committed} value={`${fmtMoney(totals.committed, lang)} ${L.currency}`} accent="slate" />
        {showBudgets && (
          <Kpi theme={theme} label={L.kpi.remaining}
            value={`${fmtMoney(totals.remaining, lang)} ${L.currency}`}
            accent={totals.remaining >= 0 ? 'emerald' : 'rose'} />
        )}
        {showSavings && (
          <Kpi theme={theme} label={L.kpi.savings} value={`${fmtMoney(totals.savings, lang)} ${L.currency}`} accent="emerald" />
        )}
      </div>

      <div className={`${theme.surface} border ${theme.border} rounded-xl p-5`}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-semibold">{L.company.title}</h3>
          <span className={`text-xs ${theme.textDim}`}>{L.kpi.headcount}: <span className="tabular-nums">{totals.headcount}</span></span>
        </div>
        <div className="space-y-4">
          {companies.map(c => {
            const ag = aggregates[c.id];
            if (!ag) return null;
            const pct = Number(ag.allocated) > 0 ? Math.min(100, (Number(ag.committed) / Number(ag.allocated)) * 100) : 0;
            const over = Number(ag.committed) > Number(ag.allocated);
            const compUnits = orgUnits.filter(u => u.company_id === c.id && u.parent_id === null);
            return (
              <div key={c.id} className={`pb-4 border-b ${theme.border} last:border-0 last:pb-0`}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-bold">{c.name_az}</span>
                  <span className={theme.textDim}>
                    <span className="tabular-nums">{fmtMoney(ag.committed, lang)}</span>
                    {showBudgets && <> <span className={theme.textFaint}>/ <span className="tabular-nums">{fmtMoney(ag.allocated, lang)}</span></span></>}
                    {' '}{L.currency}
                  </span>
                </div>
                {showBudgets && (
                  <div className={`h-2 rounded-full ${theme.surface2} overflow-hidden border ${theme.border}`}>
                    <div className={`h-full rounded-full ${
                      over ? 'bg-rose-500' : pct > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                    }`} style={{ width: `${over ? 100 : pct}%` }} />
                  </div>
                )}
                {showSavings && Number(ag.savings) > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                      {fmtMoney(ag.savings, lang)} {L.currency}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {companies.length === 0 && <div className={`text-sm ${theme.textDim} text-center py-6`}>{L.empty}</div>}
        </div>
      </div>
    </div>
  );
}
