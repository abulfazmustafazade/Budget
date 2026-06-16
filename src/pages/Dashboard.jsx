import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Users, Wallet, AlertTriangle,
  ChevronDown, ChevronRight, ArrowUpRight, Info
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, Kpi, useTheme, FilterChip } from '../components/primitives';
import { fmtMoney, canSeeField } from '../lib/permissions';

const YEAR = new Date().getFullYear();

export default function Dashboard() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits }  = useOrgUnits();

  const [companyFilter, setCompanyFilter] = useState(null);
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());

  const showBudgets  = canSeeField(profile, perms, 'see_budgets');
  const showSavings  = canSeeField(profile, perms, 'see_savings');
  const showSalaries = canSeeField(profile, perms, 'see_salaries');

  const activeCompany = companyFilter || companies[0]?.id;

  useEffect(() => {
    if (!activeCompany) return;
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase.rpc('get_function_budget_dashboard', {
        p_company_id: activeCompany, p_year: YEAR,
      });
      setData(rows || []);
      setLoading(false);
    })();
  }, [activeCompany]);

  // Şirkət üst cəm
  const totals = useMemo(() => {
    const co = companies.find(c => c.id === activeCompany);
    return {
      budget:          Number(co?.budget || 0),
      committed:       data.reduce((s, r) => s + Number(r.committed_regular || 0), 0),
      insource:        data.reduce((s, r) => s + Number(r.committed_insource || 0), 0),
      savings:         data.reduce((s, r) => s + Number(r.savings_from_exits || 0), 0),
      savings_used:    data.reduce((s, r) => s + Number(r.savings_used || 0), 0),
      one_time:        data.reduce((s, r) => s + Number(r.one_time_total || 0), 0),
      headcount:       data.reduce((s, r) => s + Number(r.headcount_active || 0), 0),
      year_end:        data.reduce((s, r) => s + Number(r.year_end_forecast || 0), 0),
    };
  }, [data, companies, activeCompany]);

  const savings_available = totals.savings - totals.savings_used;
  const over = totals.committed > totals.budget && totals.budget > 0;

  // Ağac qur: yalnız has_budget=true olan unitlər
  const budgetUnits = data.filter(r => r.has_budget);
  const tree = (parentId) => budgetUnits.filter(r => r.parent_id === parentId);

  const toggle = (id) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={L.nav.dashboard} subtitle={`${L.year} ${YEAR}`} theme={theme} />

      {/* Şirkət filteri */}
      {companies.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {companies.map(c => (
            <FilterChip key={c.id} active={activeCompany === c.id}
              onClick={() => setCompanyFilter(c.id)} theme={theme}>
              {c.name_az}
            </FilterChip>
          ))}
        </div>
      )}

      {/* ── Top KPI kartları ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {showBudgets && (
          <Kpi theme={theme} label="Ümumi büdcə"
            value={`${fmtMoney(totals.budget, lang)} ${L.currency}`} accent="blue" />
        )}
        <Kpi theme={theme} label="Xərclənmiş"
          value={`${fmtMoney(totals.committed, lang)} ${L.currency}`}
          accent={over ? 'rose' : 'slate'} />
        {showBudgets && (
          <Kpi theme={theme} label="Qalıq"
            value={`${fmtMoney(totals.budget - totals.committed, lang)} ${L.currency}`}
            accent={over ? 'rose' : 'emerald'} />
        )}
        {showSavings && (
          <Kpi theme={theme} label="Mövcud qənaət"
            value={`${fmtMoney(savings_available, lang)} ${L.currency}`}
            accent="emerald" />
        )}
      </div>

      {/* ── Qənaət xülasəsi ── */}
      {showSavings && (totals.savings > 0 || totals.savings_used > 0) && (
        <div className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
          <div className="font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Qənaət balansı
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Çıxmışlardan qənaət</div>
              <div className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(totals.savings, lang)} {L.currency}</div>
            </div>
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>İstifadə edilmiş</div>
              <div className="font-bold tabular-nums text-amber-600 dark:text-amber-400">{fmtMoney(totals.savings_used, lang)} {L.currency}</div>
            </div>
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Qalıq qənaət</div>
              <div className={`font-bold tabular-nums ${savings_available >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                {fmtMoney(savings_available, lang)} {L.currency}
              </div>
            </div>
          </div>
          {totals.insource > 0 && (
            <div className={`mt-3 pt-3 border-t ${theme.border} flex items-center gap-2 text-xs ${theme.textDim}`}>
              <Info className="w-3.5 h-3.5 shrink-0" />
              Vendor insource: <span className="font-semibold tabular-nums">{fmtMoney(totals.insource, lang)} {L.currency}</span>
              <span className={theme.textFaint}>(əlavə xərc sayılmır)</span>
            </div>
          )}
        </div>
      )}

      {/* ── İl sonu proqnoz ── */}
      {showBudgets && (
        <div className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
          <div className="font-semibold text-sm mb-3">İl sonu büdcə proqnozu</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Maaş xərcləri</div>
              <div className="font-bold tabular-nums">{fmtMoney(totals.committed, lang)}</div>
            </div>
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Bir dəfəlik ödənişlər</div>
              <div className="font-bold tabular-nums">{fmtMoney(totals.one_time, lang)}</div>
            </div>
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Qənaətdən istifadə</div>
              <div className="font-bold tabular-nums">{fmtMoney(totals.savings_used, lang)}</div>
            </div>
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Cəm proqnoz</div>
              <div className={`font-bold tabular-nums text-lg ${totals.year_end > totals.budget && totals.budget > 0 ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}>
                {fmtMoney(totals.year_end, lang)} {L.currency}
              </div>
            </div>
          </div>
          {totals.budget > 0 && (
            <div className="mt-3">
              <div className={`h-2 rounded-full ${theme.surface2} overflow-hidden border ${theme.border}`}>
                <div className={`h-full rounded-full transition-all ${
                  totals.year_end > totals.budget ? 'bg-rose-500' :
                  totals.year_end / totals.budget > 0.9 ? 'bg-amber-500' :
                  'bg-gradient-to-r from-blue-500 to-emerald-500'
                }`} style={{ width: `${Math.min(100, (totals.year_end / totals.budget) * 100)}%` }} />
              </div>
              <div className={`flex justify-between text-xs mt-1 ${theme.textFaint}`}>
                <span className="tabular-nums">{Math.round((totals.year_end / totals.budget) * 100)}% istifadə</span>
                <span className="tabular-nums">{fmtMoney(totals.budget, lang)} büdcə</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Funksiya səviyyəsində büdcə cədvəli ── */}
      {showBudgets && (
        <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
          <div className={`px-4 py-3 border-b ${theme.border} flex items-center justify-between`}>
            <div className="font-semibold text-sm">Funksiya büdcəsi</div>
            <div className={`text-xs ${theme.textDim}`}>{YEAR}</div>
          </div>

          {loading ? (
            <div className={`p-8 text-center text-sm ${theme.textDim}`}>Yüklənir...</div>
          ) : (
            <div>
              {/* Cədvəl başlığı */}
              <div className={`grid px-4 py-2 text-[10px] uppercase tracking-wider font-bold ${theme.textFaint} border-b ${theme.border}`}
                style={{ gridTemplateColumns: '1fr 100px 100px 100px 80px' }}>
                <span>Funksiya</span>
                <span className="text-right">Büdcə</span>
                <span className="text-right">Xərc</span>
                {showSavings && <span className="text-right">Qənaət</span>}
                <span className="text-right">İşçi</span>
              </div>

              {/* Kök unitlər */}
              {budgetUnits.filter(r => !r.parent_id || !budgetUnits.find(p => p.org_unit_id === r.parent_id)).map(r => (
                <FunctionRow key={r.org_unit_id} row={r} data={budgetUnits}
                  depth={0} expanded={expanded} onToggle={toggle}
                  theme={theme} lang={lang} L={L}
                  showSavings={showSavings} showSalaries={showSalaries} />
              ))}

              {budgetUnits.length === 0 && (
                <div className={`p-8 text-center text-sm ${theme.textDim}`}>
                  Büdcəsi olan bölmə yoxdur. Strukturda bölmələrə büdcə təyin edin.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Headcount xülasəsi ── */}
      <div className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
        <div className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          İşçi sayı
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Aktiv işçi</div>
            <div className="text-2xl font-bold tabular-nums">{totals.headcount}</div>
          </div>
          <div>
            <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Boş vəzifə</div>
            <div className={`text-2xl font-bold tabular-nums ${data.reduce((s,r) => s + Number(r.headcount_vacant||0), 0) > 0 ? 'text-rose-500' : theme.text}`}>
              {data.reduce((s, r) => s + Number(r.headcount_vacant || 0), 0)}
            </div>
          </div>
          {totals.insource > 0 && (
            <div>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim} mb-1`}>Vendor insource</div>
              <div className="text-2xl font-bold tabular-nums text-blue-500">
                {data.filter(r => r.committed_insource > 0).length}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Funksiya sırası (ağac) ────────────────────────────────────────────────
function FunctionRow({ row, data, depth, expanded, onToggle, theme, lang, L, showSavings, showSalaries }) {
  const children = data.filter(r => r.parent_id === row.org_unit_id);
  const isExpanded = expanded.has(row.org_unit_id) || depth < 1;
  const hasChildren = children.length > 0;

  const budget    = Number(row.total_budget || 0);
  const committed = Number(row.committed_regular || 0);
  const savings   = Number(row.savings_from_exits || 0) - Number(row.savings_used || 0);
  const pct       = budget > 0 ? Math.min(100, (committed / budget) * 100) : 0;
  const over      = budget > 0 && committed > budget;

  const LEVEL_COLORS = {
    division: 'text-blue-500', department: 'text-emerald-600 dark:text-emerald-400',
    sub_department: 'text-purple-500', unit: 'text-amber-600', sub_unit: 'text-slate-500',
  };

  return (
    <>
      <div className={`border-b ${theme.border} last:border-0`}
        style={{ paddingLeft: `${depth * 20}px` }}>
        <div className={`grid items-center px-4 py-3 hover:bg-blue-500/5 cursor-pointer`}
          style={{ gridTemplateColumns: '1fr 100px 100px 100px 80px' }}
          onClick={() => hasChildren && onToggle(row.org_unit_id)}>

          {/* Ad */}
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <span className={`w-4 h-4 flex items-center justify-center ${theme.textFaint}`}>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            ) : <span className="w-4" />}
            <div className="min-w-0">
              <div className={`text-sm font-semibold truncate ${LEVEL_COLORS[row.org_unit_level] || theme.text}`}>
                {row.org_unit_name}
              </div>
              {/* Mini progress */}
              {budget > 0 && (
                <div className={`h-1 rounded-full ${theme.surface2} overflow-hidden mt-1 w-24`}>
                  <div className={`h-full rounded-full ${over ? 'bg-rose-500' : pct > 85 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Büdcə */}
          <div className="text-right">
            {budget > 0
              ? <span className={`text-xs tabular-nums font-semibold ${theme.textDim}`}>{fmtMoney(budget, lang)}</span>
              : <span className={`text-xs ${theme.textFaint}`}>—</span>}
          </div>

          {/* Xərc */}
          <div className="text-right">
            <span className={`text-xs tabular-nums font-semibold ${over ? 'text-rose-500' : theme.text}`}>
              {fmtMoney(committed, lang)}
            </span>
            {Number(row.committed_insource || 0) > 0 && (
              <div className={`text-[10px] tabular-nums ${theme.textFaint}`}>
                +{fmtMoney(row.committed_insource, lang)} insource
              </div>
            )}
          </div>

          {/* Qənaət */}
          {showSavings && (
            <div className="text-right">
              {savings > 0
                ? <span className="text-xs tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                    {fmtMoney(savings, lang)}
                  </span>
                : savings < 0
                  ? <span className="text-xs tabular-nums text-amber-500">{fmtMoney(savings, lang)}</span>
                  : <span className={`text-xs ${theme.textFaint}`}>—</span>}
            </div>
          )}

          {/* İşçi */}
          <div className="text-right">
            <span className={`text-xs tabular-nums font-semibold ${theme.text}`}>
              {row.headcount_active || 0}
            </span>
            {Number(row.headcount_vacant || 0) > 0 && (
              <div className="text-[10px] tabular-nums text-rose-500">
                {row.headcount_vacant} boş
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Övladlar */}
      {isExpanded && children.map(child => (
        <FunctionRow key={child.org_unit_id} row={child} data={data}
          depth={depth + 1} expanded={expanded} onToggle={onToggle}
          theme={theme} lang={lang} L={L}
          showSavings={showSavings} showSalaries={showSalaries} />
      ))}
    </>
  );
}
