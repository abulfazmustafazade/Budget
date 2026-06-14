import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, TrendingUp, Wallet, Users, Briefcase } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons } from '../components/primitives';
import { fmtMoney, canSeeField, hasPerm } from '../lib/permissions';

const YEAR = new Date().getFullYear();

export default function Companies() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies, refresh } = useCompanies();
  const { data: orgUnits } = useOrgUnits();
  const [summaries, setSummaries] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const isAdmin = profile?.is_admin;
  const canEditBudgets = hasPerm(profile, perms, 'can_edit_budgets');
  const showBudgets = canSeeField(profile, perms, 'see_budgets');
  const showSavings = canSeeField(profile, perms, 'see_savings');

  useEffect(() => {
    (async () => {
      const r = {};
      for (const c of companies) {
        const { data } = await supabase.rpc('get_company_budget_summary', {
          p_company_id: c.id, p_year: YEAR,
        });
        r[c.id] = data?.[0] || {};
      }
      setSummaries(r);
    })();
  }, [companies]);

  const save = async (c) => {
    const payload = {
      name_en: c.name_en,
      name_az: c.name_az,
      budget: Number(c.budget) || 0,
      budget_headcount: Number(c.budget_headcount) || 0,
      budget_vacancy: Number(c.budget_vacancy) || 0,
      budget_salary_inc: Number(c.budget_salary_inc) || 0,
      fiscal_year: YEAR,
    };
    if (c._new) {
      const { error } = await supabase.from('companies').insert(payload);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('companies').update(payload).eq('id', c.id);
      if (error) { alert(error.message); return; }
    }
    setEditing(null);
    refresh();
  };

  const doDelete = async () => {
    const { error } = await supabase.from('companies').delete().eq('id', deleting.id);
    if (error) { alert(error.message); return; }
    setDeleting(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.company.title}
        subtitle={`${companies.length}`}
        theme={theme}
        action={isAdmin && (
          <button
            onClick={() => setEditing({ id: crypto.randomUUID(), name_en: '', name_az: '', budget: 0, budget_headcount: 0, budget_vacancy: 0, budget_salary_inc: 0, fiscal_year: YEAR, _new: true })}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />{L.company.add}
          </button>
        )}
      />

      {!isAdmin && (
        <div className={`${theme.surface2} border ${theme.border} rounded-lg p-3 text-xs ${theme.textDim} flex items-start gap-2`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span>{L.company.adminOnly}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {companies.map(c => {
          const s = summaries[c.id] || {};
          const committed = Number(s.committed || 0);
          const totalBudget = Number(c.budget || 0);
          const pct = totalBudget > 0 ? Math.min(100, (committed / totalBudget) * 100) : 0;
          const over = committed > totalBudget;
          const childCount = orgUnits.filter(u => u.company_id === c.id).length;

          return (
            <div key={c.id} className={`${theme.surface} border ${theme.border} rounded-xl p-5`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-bold text-lg">{c.name_az}</div>
                  <div className={`text-xs ${theme.textDim} mt-0.5`}>
                    {childCount} bölmə · <span className="tabular-nums">{s.headcount || 0}</span> işçi
                  </div>
                </div>
                <div className="flex gap-1">
                  {(isAdmin || canEditBudgets) && (
                    <button onClick={() => setEditing({ ...c })} className={`p-1.5 rounded-md ${theme.hover}`}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setDeleting(c)} className={`p-1.5 rounded-md ${theme.hover} text-rose-500`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {showBudgets && (
                <>
                  {/* 3 büdcə növü */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <BudgetChip
                      icon={<Users className="w-3.5 h-3.5" />}
                      label="İşçi büdcəsi"
                      value={c.budget_headcount}
                      lang={lang}
                      currency={L.currency}
                      color="blue"
                      theme={theme}
                    />
                    <BudgetChip
                      icon={<Briefcase className="w-3.5 h-3.5" />}
                      label="Vakansiya"
                      value={c.budget_vacancy}
                      lang={lang}
                      currency={L.currency}
                      color="emerald"
                      theme={theme}
                    />
                    <BudgetChip
                      icon={<TrendingUp className="w-3.5 h-3.5" />}
                      label="Maaş artımı"
                      value={c.budget_salary_inc}
                      lang={lang}
                      currency={L.currency}
                      color="amber"
                      theme={theme}
                    />
                  </div>

                  {/* Ümumi büdcə vs xərc */}
                  <div className={`p-3 rounded-lg ${theme.surface2} border ${theme.border} space-y-2`}>
                    <div className="flex justify-between text-sm">
                      <span className={theme.textDim}>Ümumi büdcə</span>
                      <span className="font-bold tabular-nums">{fmtMoney(totalBudget, lang)} {L.currency}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className={theme.textDim}>Xərclənmiş</span>
                      <span className={`font-bold tabular-nums ${over ? 'text-rose-500' : ''}`}>
                        {fmtMoney(committed, lang)} {L.currency}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className={theme.textDim}>Qalıq</span>
                      <span className={`font-bold tabular-nums ${over ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {fmtMoney(totalBudget - committed, lang)} {L.currency}
                      </span>
                    </div>
                    <div className={`h-2 rounded-full ${theme.surface2} overflow-hidden border ${theme.border} mt-1`}>
                      <div
                        className={`h-full rounded-full transition-all ${over ? 'bg-rose-500' : pct > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-emerald-500'}`}
                        style={{ width: `${over ? 100 : pct}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {showSavings && Number(s.savings || 0) > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                    {fmtMoney(s.savings, lang)} {L.currency} qənaət
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <CompanyEditModal L={L} theme={theme} company={editing} isAdmin={isAdmin} onSave={save} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <Modal onClose={() => setDeleting(null)} theme={theme} title="Şirkəti sil?">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <div className="font-semibold text-sm">{deleting.name_az}</div>
              <div className={`text-xs ${theme.textDim} mt-1`}>Bu əməliyyat geri qaytarıla bilməz.</div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={doDelete} className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">Sil</button>
            <button onClick={() => setDeleting(null)} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm`}>{L.actions.cancel}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BudgetChip({ icon, label, value, lang, currency, color, theme }) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    emerald:'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber:  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };
  return (
    <div className={`rounded-lg p-2.5 ${colors[color]}`}>
      <div className="flex items-center gap-1 mb-1 opacity-80">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
      <div className="text-sm font-bold tabular-nums">{fmtMoney(value, lang)}</div>
      <div className="text-[10px] opacity-70">{currency}</div>
    </div>
  );
}

function CompanyEditModal({ L, theme, company, isAdmin, onSave, onClose }) {
  const [c, setC] = useState(company);
  const total = Number(c.budget_headcount || 0) + Number(c.budget_vacancy || 0) + Number(c.budget_salary_inc || 0);

  // Ümumi büdcəni avtomatik hesabla
  const setField = (field, val) => {
    const updated = { ...c, [field]: val };
    updated.budget = Number(updated.budget_headcount || 0) + Number(updated.budget_vacancy || 0) + Number(updated.budget_salary_inc || 0);
    setC(updated);
  };

  const valid = c.name_en && c.name_az;
  return (
    <Modal onClose={onClose} theme={theme} title={c._new ? L.company.add : L.company.edit}>
      <div className="space-y-3">
        <Field label={L.company.nameEn} theme={theme}>
          <input value={c.name_en} onChange={e => setC({ ...c, name_en: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>
        <Field label={L.company.nameAz} theme={theme}>
          <input value={c.name_az} onChange={e => setC({ ...c, name_az: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>

        <div className={`p-3 rounded-lg border ${theme.border} ${theme.surface2} space-y-3`}>
          <div className={`text-[11px] font-bold uppercase tracking-wider ${theme.textDim}`}>Büdcə növləri (AZN)</div>
          <Field label="İşçi büdcəsi" theme={theme}>
            <input type="number" value={c.budget_headcount}
              onChange={e => setField('budget_headcount', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <Field label="Vakansiya büdcəsi" theme={theme}>
            <input type="number" value={c.budget_vacancy}
              onChange={e => setField('budget_vacancy', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <Field label="Maaş artımı büdcəsi" theme={theme}>
            <input type="number" value={c.budget_salary_inc}
              onChange={e => setField('budget_salary_inc', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <div className={`flex justify-between pt-2 border-t ${theme.border} text-sm font-bold`}>
            <span>Ümumi büdcə</span>
            <span className="tabular-nums text-blue-600 dark:text-blue-400">{fmtMoney(total, 'az')} AZN</span>
          </div>
        </div>
      </div>
      <Buttons onSave={() => onSave(c)} onCancel={onClose} disabled={!valid} L={L} theme={theme} />
    </Modal>
  );
}
