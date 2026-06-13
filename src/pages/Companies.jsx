import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, TrendingUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits, fetchCompanyAggregate } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons } from '../components/primitives';
import { fmtMoney, canSeeField, hasPerm } from '../lib/permissions';

const YEAR = new Date().getFullYear();

export default function Companies() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies, refresh } = useCompanies();
  const { data: orgUnits } = useOrgUnits();
  const [aggregates, setAggregates] = useState({});

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const isAdmin = profile?.is_admin;
  const canEditBudgets = hasPerm(profile, perms, 'can_edit_budgets');
  const showBudgets = canSeeField(profile, perms, 'see_budgets');
  const showSavings = canSeeField(profile, perms, 'see_savings');

  useEffect(() => {
    (async () => {
      const r = {};
      for (const c of companies) r[c.id] = await fetchCompanyAggregate(c.id, YEAR);
      setAggregates(r);
    })();
  }, [companies]);

  const save = async (c) => {
    if (c._new) {
      const { _new, id, ...payload } = c;
      const { error } = await supabase.from('companies').insert(payload);
      if (error) alert(error.message);
    } else {
      const { _new, ...payload } = c;
      const { error } = await supabase.from('companies').update(payload).eq('id', c.id);
      if (error) alert(error.message);
    }
    setEditing(null);
    refresh();
  };

  const doDelete = async () => {
    const { error } = await supabase.from('companies').delete().eq('id', deleting.id);
    if (error) alert(error.message);
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
            onClick={() => setEditing({ id: crypto.randomUUID(), name_en: '', name_az: '', budget: 0, fiscal_year: YEAR, _new: true })}
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
          const ag = aggregates[c.id] || {};
          const allocated = Number(ag.allocated || 0);
          const committed = Number(ag.committed || 0);
          const pct = allocated > 0 ? (committed / allocated) * 100 : 0;
          const over = committed > allocated;
          const childCount = orgUnits.filter(u => u.company_id === c.id).length;
          return (
            <div key={c.id} className={`${theme.surface} border ${theme.border} rounded-xl p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-lg">{c.name_az}</div>
                  <div className={`text-xs ${theme.textDim} mt-0.5`}>
                    <span className="tabular-nums">{childCount}</span> {L.nav.organization.toLowerCase()} · <span className="tabular-nums">{ag.headcount || 0}</span> {L.common.employees.toLowerCase()}
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

              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                {showBudgets && (
                  <div>
                    <div className={`text-[11px] uppercase tracking-wider ${theme.textDim} font-semibold`}>{L.common.budget}</div>
                    <div className="font-bold tabular-nums">{fmtMoney(allocated, lang)}</div>
                  </div>
                )}
                <div>
                  <div className={`text-[11px] uppercase tracking-wider ${theme.textDim} font-semibold`}>{L.common.used}</div>
                  <div className="font-bold tabular-nums">{fmtMoney(committed, lang)}</div>
                </div>
                {showBudgets && (
                  <div>
                    <div className={`text-[11px] uppercase tracking-wider ${theme.textDim} font-semibold`}>{L.common.left}</div>
                    <div className={`font-bold tabular-nums ${over ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {fmtMoney(allocated - committed, lang)}
                    </div>
                  </div>
                )}
              </div>

              {showBudgets && (
                <div className={`h-2 rounded-full ${theme.surface2} overflow-hidden border ${theme.border}`}>
                  <div
                    className={`h-full rounded-full ${
                      over ? 'bg-rose-500' : pct > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                    }`}
                    style={{ width: `${over ? 100 : pct}%` }}
                  />
                </div>
              )}

              {showSavings && Number(ag.savings || 0) > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                    {fmtMoney(ag.savings, lang)} {L.currency} {L.kpi.savings.toLowerCase()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <CompanyEditModal L={L} theme={theme} company={editing}
          isAdmin={isAdmin} onSave={save} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDeleteModal L={L} theme={theme} title={deleting.name_az}
          warning={orgUnits.filter(u => u.company_id === deleting.id).length > 0
            ? `${orgUnits.filter(u => u.company_id === deleting.id).length} units bağlıdır`
            : null}
          onConfirm={doDelete} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

function CompanyEditModal({ L, theme, company, isAdmin, onSave, onClose }) {
  const [c, setC] = useState(company);
  const valid = c.name_en && c.name_az;
  return (
    <Modal onClose={onClose} theme={theme} title={c._new ? L.company.add : L.company.edit}>
      <div className="space-y-3">
        <Field label={L.company.nameEn} theme={theme}>
          <input
            value={c.name_en}
            onChange={(e) => setC({ ...c, name_en: e.target.value })}
            disabled={!isAdmin && !c._new}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm disabled:opacity-60`}
            autoFocus
          />
        </Field>
        <Field label={L.company.nameAz} theme={theme}>
          <input
            value={c.name_az}
            onChange={(e) => setC({ ...c, name_az: e.target.value })}
            disabled={!isAdmin && !c._new}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm disabled:opacity-60`}
          />
        </Field>
        <Field label={`${L.common.budget} (${L.currency})`} theme={theme}>
          <input
            type="number"
            value={c.budget}
            onChange={(e) => setC({ ...c, budget: Number(e.target.value) || 0 })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`}
          />
        </Field>
      </div>
      <Buttons onSave={() => onSave(c)} onCancel={onClose} disabled={!valid} L={L} theme={theme} />
    </Modal>
  );
}

function ConfirmDeleteModal({ L, theme, title, warning, onConfirm, onClose }) {
  return (
    <Modal onClose={onClose} theme={theme} title={L.confirm.delete}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <div className="font-semibold text-sm">{title}</div>
          {warning ? (
            <div className="text-xs mt-1 text-amber-600 dark:text-amber-400">{warning}</div>
          ) : (
            <div className={`text-xs ${theme.textDim} mt-1`}>{L.confirm.cannotUndo}</div>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        {!warning && (
          <button onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">
            {L.actions.delete}
          </button>
        )}
        <button onClick={onClose}
          className={`${warning ? 'flex-1' : ''} px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}>
          {warning ? 'OK' : L.actions.cancel}
        </button>
      </div>
    </Modal>
  );
}
