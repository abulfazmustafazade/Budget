import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, ChevronDown, ChevronRight, Users, Briefcase, TrendingUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons, FilterChip } from '../components/primitives';
import { fmtMoney, canSeeField, hasPerm } from '../lib/permissions';

const LEVELS = ['division', 'department', 'sub_department', 'unit', 'sub_unit'];
const levelOrder = (l) => LEVELS.indexOf(l);
const nextLevel  = (l) => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(l) + 1)];
const YEAR = new Date().getFullYear();

export default function Organization() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits, refresh } = useOrgUnits();

  const [companyFilter, setCompanyFilter] = useState(null);
  const [expanded, setExpanded]           = useState(new Set());
  const [editing, setEditing]             = useState(null);
  const [deleting, setDeleting]           = useState(null);
  const [summaries, setSummaries]         = useState({});

  const isAdmin       = profile?.is_admin;
  const canEditBudgets= hasPerm(profile, perms, 'can_edit_budgets');
  const showBudgets   = canSeeField(profile, perms, 'see_budgets');
  const showSavings   = canSeeField(profile, perms, 'see_savings');

  // Hər org unit üçün büdcə xülasəsi yüklə
  useEffect(() => {
    if (!showBudgets) return;
    (async () => {
      const r = {};
      for (const u of orgUnits) {
        const { data } = await supabase.rpc('get_org_unit_budget_summary', {
          p_org_unit_id: u.id, p_year: YEAR,
        });
        r[u.id] = data?.[0] || {};
      }
      setSummaries(r);
    })();
  }, [orgUnits, showBudgets]);

  // Tree quruluşu
  const tree = useMemo(() => {
    const filtered = companyFilter ? orgUnits.filter(u => u.company_id === companyFilter) : orgUnits;
    const byParent = {};
    for (const u of filtered) {
      const key = u.parent_id || `root_${u.company_id}`;
      (byParent[key] = byParent[key] || []).push(u);
    }
    return byParent;
  }, [orgUnits, companyFilter]);

  const toggleExpand = (id) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  const save = async (u) => {
    const payload = {
      company_id:        u.company_id,
      parent_id:         u.parent_id || null,
      level:             u.level,
      name_en:           u.name_en,
      name_az:           u.name_az,
      budget_headcount:  Number(u.budget_headcount  || 0),
      budget_vacancy:    Number(u.budget_vacancy    || 0),
      budget_salary_inc: Number(u.budget_salary_inc || 0),
      budget: Number(u.budget_headcount||0) + Number(u.budget_vacancy||0) + Number(u.budget_salary_inc||0),
    };
    if (u._new) {
      const { error } = await supabase.from('org_units').insert(payload);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('org_units').update(payload).eq('id', u.id);
      if (error) { alert(error.message); return; }
    }
    setEditing(null);
    refresh();
  };

  const doDelete = async () => {
    const { error } = await supabase.from('org_units').delete().eq('id', deleting.id);
    if (error) { alert(error.message); return; }
    setDeleting(null);
    refresh();
  };

  const startAdd = (parentUnit) => {
    setEditing({
      id: crypto.randomUUID(),
      company_id:        parentUnit ? parentUnit.company_id : (companyFilter || companies[0]?.id),
      parent_id:         parentUnit?.id || null,
      level:             parentUnit ? nextLevel(parentUnit.level) : 'division',
      name_en: '', name_az: '',
      budget_headcount: 0, budget_vacancy: 0, budget_salary_inc: 0,
      _new: true,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.org.title}
        subtitle={`${orgUnits.length}`}
        theme={theme}
        action={isAdmin && companies.length > 0 && (
          <button onClick={() => startAdd(null)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5">
            <Plus className="w-4 h-4" />{L.org.add}
          </button>
        )}
      />

      {!isAdmin && (
        <div className={`${theme.surface2} border ${theme.border} rounded-lg p-3 text-xs ${theme.textDim} flex items-start gap-2`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span>{L.org.adminOnly}</span>
        </div>
      )}

      {companies.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <FilterChip active={!companyFilter} onClick={() => setCompanyFilter(null)} theme={theme}>{L.common.all}</FilterChip>
          {companies.map(c => (
            <FilterChip key={c.id} active={companyFilter === c.id} onClick={() => setCompanyFilter(c.id)} theme={theme}>
              {c.name_az}
            </FilterChip>
          ))}
        </div>
      )}

      <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
        {companies
          .filter(c => !companyFilter || c.id === companyFilter)
          .map(c => {
            const rootKey = `root_${c.id}`;
            const roots = (tree[rootKey] || []);
            return (
              <div key={c.id} className={`border-b ${theme.border} last:border-0`}>
                {/* Şirkət başlığı */}
                <div className={`px-4 py-3 ${theme.surface2} flex items-center justify-between`}>
                  <div>
                    <span className="font-bold text-sm">{c.name_az}</span>
                    {showBudgets && (
                      <span className={`ml-3 text-xs ${theme.textDim} tabular-nums`}>
                        Ümumi: {fmtMoney(c.budget, lang)} AZN
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <button onClick={() => startAdd({ company_id: c.id, level: 'division', id: null })}
                      className={`text-xs px-2 py-1 rounded border ${theme.border} ${theme.hover} flex items-center gap-1`}>
                      <Plus className="w-3 h-3" /> {L.levels.division}
                    </button>
                  )}
                </div>

                {roots.length === 0 ? (
                  <div className={`px-4 py-6 text-center text-xs ${theme.textFaint}`}>{L.org.treeEmpty}</div>
                ) : (
                  roots.map(u => (
                    <TreeNode key={u.id} unit={u} tree={tree}
                      expanded={expanded} onToggle={toggleExpand}
                      onEdit={setEditing} onDelete={setDeleting} onAdd={startAdd}
                      theme={theme} L={L} lang={lang} depth={0}
                      canEdit={isAdmin || canEditBudgets} canManage={isAdmin}
                      showBudgets={showBudgets} showSavings={showSavings}
                      summaries={summaries} />
                  ))
                )}
              </div>
            );
          })}
      </div>

      {editing && (
        <OrgUnitEditModal L={L} lang={lang} theme={theme} unit={editing}
          companies={companies} orgUnits={orgUnits} isAdmin={isAdmin}
          onSave={save} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <Modal onClose={() => setDeleting(null)} theme={theme} title={L.confirm.delete}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <div className="font-semibold text-sm">{deleting.name_az}</div>
              <div className={`text-xs ${theme.textDim} mt-1`}>{L.confirm.cannotUndo}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={doDelete} className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">{L.actions.delete}</button>
            <button onClick={() => setDeleting(null)} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm`}>{L.actions.cancel}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tree Node ───────────────────────────────────────────────────────────────
function TreeNode({ unit, tree, expanded, onToggle, onEdit, onDelete, onAdd,
  theme, L, lang, depth, canEdit, canManage, showBudgets, showSavings, summaries }) {
  const children   = tree[unit.id] || [];
  const isExpanded = expanded.has(unit.id) || depth < 1;
  const hasChildren= children.length > 0;
  const s          = summaries[unit.id] || {};
  const committed  = Number(s.committed || 0);
  const budget     = Number(unit.budget || 0);
  const pct        = budget > 0 ? Math.min(100, (committed / budget) * 100) : 0;
  const over       = committed > budget && budget > 0;

  const levelColors = {
    division:       'bg-blue-500/10 text-blue-500',
    department:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    sub_department: 'bg-purple-500/10 text-purple-500',
    unit:           'bg-amber-500/10 text-amber-600',
    sub_unit:       'bg-slate-500/10 text-slate-500',
  };

  return (
    <>
      {/* Əsas sıra */}
      <div className={`border-t ${theme.border}`} style={{ paddingLeft: `${depth * 20}px` }}>
        <div className={`flex items-start gap-2 px-4 py-3 hover:bg-blue-500/5`}>
          {/* Genişlət/daralt */}
          <button onClick={() => onToggle(unit.id)} className="mt-0.5 shrink-0 w-5 h-5 flex items-center justify-center">
            {hasChildren
              ? isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
              : <span className="w-3.5" />}
          </button>

          {/* Ad + level */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{unit.name_az}</span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${levelColors[unit.level]}`}>
                {L.levels[unit.level]}
              </span>
            </div>

            {/* 3 büdcə növü + progress */}
            {showBudgets && budget > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-3 text-xs flex-wrap">
                  <BudgetPill icon={<Users className="w-3 h-3" />} label="İşçi" value={unit.budget_headcount} lang={lang} color="blue" theme={theme} />
                  <BudgetPill icon={<Briefcase className="w-3 h-3" />} label="Vakansiya" value={unit.budget_vacancy} lang={lang} color="emerald" theme={theme} />
                  <BudgetPill icon={<TrendingUp className="w-3 h-3" />} label="Maaş artımı" value={unit.budget_salary_inc} lang={lang} color="amber" theme={theme} />
                  <span className={`${theme.textFaint} ml-auto`}>
                    Cəm: <span className="tabular-nums font-semibold">{fmtMoney(budget, lang)}</span>
                  </span>
                </div>

                {/* Xərc progress bar */}
                {committed > 0 && (
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 h-1.5 rounded-full ${theme.surface2} overflow-hidden`}>
                      <div className={`h-full rounded-full ${over ? 'bg-rose-500' : pct > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-emerald-500'}`}
                        style={{ width: `${over ? 100 : pct}%` }} />
                    </div>
                    <span className={`text-[10px] tabular-nums ${over ? 'text-rose-500' : theme.textFaint}`}>
                      {fmtMoney(committed, lang)} / {fmtMoney(budget, lang)}
                    </span>
                    {showSavings && Number(s.savings || 0) > 0 && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                        ↑{fmtMoney(s.savings, lang)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Əməliyyat düymələri */}
          <div className="flex gap-0.5 shrink-0 mt-0.5">
            {canManage && unit.level !== 'sub_unit' && (
              <button onClick={() => onAdd(unit)} className={`p-1 rounded ${theme.hover}`} title={L.org.add}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && (
              <button onClick={() => onEdit({ ...unit })} className={`p-1 rounded ${theme.hover}`}>
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && (
              <button onClick={() => onDelete(unit)} className={`p-1 rounded ${theme.hover} text-rose-500`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Övladlar */}
      {isExpanded && children.map(child => (
        <TreeNode key={child.id} unit={child} tree={tree}
          expanded={expanded} onToggle={onToggle}
          onEdit={onEdit} onDelete={onDelete} onAdd={onAdd}
          theme={theme} L={L} lang={lang} depth={depth + 1}
          canEdit={canEdit} canManage={canManage}
          showBudgets={showBudgets} showSavings={showSavings}
          summaries={summaries} />
      ))}
    </>
  );
}

// Kiçik büdcə pill
function BudgetPill({ icon, label, value, lang, color, theme }) {
  if (!Number(value)) return null;
  const colors = {
    blue:   'text-blue-600 dark:text-blue-400',
    emerald:'text-emerald-600 dark:text-emerald-400',
    amber:  'text-amber-600 dark:text-amber-400',
  };
  return (
    <span className={`flex items-center gap-1 ${colors[color]}`}>
      {icon}
      <span className={`${theme.textFaint} text-[10px]`}>{label}:</span>
      <span className="tabular-nums font-semibold text-[11px]">{fmtMoney(value, lang)}</span>
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function OrgUnitEditModal({ L, lang, theme, unit, companies, orgUnits, isAdmin, onSave, onClose }) {
  const [u, setU] = useState(unit);

  const parentOptions = useMemo(() => {
    if (!u.company_id) return [];
    return orgUnits
      .filter(o => o.company_id === u.company_id && o.id !== u.id)
      .filter(o => levelOrder(o.level) < levelOrder(u.level));
  }, [u.company_id, u.level, u.id, orgUnits]);

  // Parent büdcəsi — xəbərdarlıq üçün
  const parentBudget = useMemo(() => {
    if (!u.parent_id) {
      const co = companies.find(c => c.id === u.company_id);
      return co ? Number(co.budget) : null;
    }
    const par = orgUnits.find(o => o.id === u.parent_id);
    return par ? Number(par.budget) : null;
  }, [u.parent_id, u.company_id, companies, orgUnits]);

  const totalBudget = Number(u.budget_headcount||0) + Number(u.budget_vacancy||0) + Number(u.budget_salary_inc||0);
  const overBudget  = parentBudget !== null && totalBudget > parentBudget;
  const valid       = u.name_en && u.name_az && u.company_id && u.level && !overBudget;

  const setField = (field, val) => setU({ ...u, [field]: val });

  return (
    <Modal onClose={onClose} theme={theme} title={u._new ? L.org.add : L.org.edit}>
      <div className="space-y-3">
        {isAdmin && (
          <>
            <Field label={L.emp.company} theme={theme}>
              <select value={u.company_id} disabled={!u._new}
                onChange={e => setU({ ...u, company_id: e.target.value, parent_id: null })}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name_az}</option>)}
              </select>
            </Field>
            <Field label={L.org.level} theme={theme}>
              <select value={u.level} disabled={!u._new}
                onChange={e => setU({ ...u, level: e.target.value, parent_id: e.target.value === 'division' ? null : u.parent_id })}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
                {LEVELS.map(l => <option key={l} value={l}>{L.levels[l]}</option>)}
              </select>
            </Field>
            <Field label={L.org.parent} theme={theme}>
              <select value={u.parent_id || ''} disabled={u.level === 'division'}
                onChange={e => setU({ ...u, parent_id: e.target.value || null })}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
                <option value="">{L.org.noParent}</option>
                {parentOptions.map(o => (
                  <option key={o.id} value={o.id}>{L.levels[o.level]} · {o.name_az}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label={L.company.nameEn} theme={theme}>
          <input value={u.name_en} onChange={e => setField('name_en', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>
        <Field label={L.company.nameAz} theme={theme}>
          <input value={u.name_az} onChange={e => setField('name_az', e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>

        {/* Büdcə növləri */}
        <div className={`p-3 rounded-lg border ${theme.border} ${theme.surface2} space-y-3`}>
          <div className={`text-[11px] font-bold uppercase tracking-wider ${theme.textDim}`}>Büdcə növləri (AZN)</div>

          <Field label="İşçi büdcəsi" theme={theme}>
            <input type="number" value={u.budget_headcount}
              onChange={e => setField('budget_headcount', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <Field label="Vakansiya büdcəsi" theme={theme}>
            <input type="number" value={u.budget_vacancy}
              onChange={e => setField('budget_vacancy', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <Field label="Maaş artımı büdcəsi" theme={theme}>
            <input type="number" value={u.budget_salary_inc}
              onChange={e => setField('budget_salary_inc', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>

          {/* Cəm + xəbərdarlıq */}
          <div className={`flex justify-between pt-2 border-t ${theme.border} text-sm font-bold`}>
            <span>Cəm</span>
            <span className={`tabular-nums ${overBudget ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}>
              {fmtMoney(totalBudget, lang)} AZN
            </span>
          </div>
          {parentBudget !== null && (
            <div className={`text-xs ${overBudget ? 'text-rose-500' : theme.textFaint}`}>
              Üst qurum büdcəsi: {fmtMoney(parentBudget, lang)} AZN
              {overBudget && ' — cəm üst büdcədən artıqdır!'}
            </div>
          )}
        </div>
      </div>
      <Buttons onSave={() => onSave(u)} onCancel={onClose} disabled={!valid} L={L} theme={theme} />
    </Modal>
  );
}
