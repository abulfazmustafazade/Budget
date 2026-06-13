import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons, FilterChip } from '../components/primitives';
import { fmtMoney, canSeeField, hasPerm } from '../lib/permissions';

const LEVELS = ['division', 'department', 'sub_department', 'unit', 'sub_unit'];
const levelOrder = (l) => LEVELS.indexOf(l);
const nextLevel = (l) => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(l) + 1)];

export default function Organization() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits, refresh } = useOrgUnits();

  const [companyFilter, setCompanyFilter] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const isAdmin = profile?.is_admin;
  const canEditBudgets = hasPerm(profile, perms, 'can_edit_budgets');
  const showBudgets = canSeeField(profile, perms, 'see_budgets');

  // Build tree
  const tree = useMemo(() => {
    const filtered = companyFilter ? orgUnits.filter(u => u.company_id === companyFilter) : orgUnits;
    const byParent = {};
    for (const u of filtered) {
      const key = u.parent_id || 'root';
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
    if (u._new) {
      const { _new, id, ...payload } = u;
      const { error } = await supabase.from('org_units').insert(payload);
      if (error) { alert(error.message); return; }
    } else {
      const { _new, ...payload } = u;
      const { error } = await supabase.from('org_units').update(payload).eq('id', u.id);
      if (error) { alert(error.message); return; }
    }
    setEditing(null);
    refresh();
  };

  const doDelete = async () => {
    const { error } = await supabase.from('org_units').delete().eq('id', deleting.id);
    if (error) alert(error.message);
    setDeleting(null);
    refresh();
  };

  const startAdd = (parentUnit) => {
    setEditing({
      id: crypto.randomUUID(),
      company_id: parentUnit ? parentUnit.company_id : (companyFilter || companies[0]?.id),
      parent_id: parentUnit?.id || null,
      level: parentUnit ? nextLevel(parentUnit.level) : 'division',
      name_en: '', name_az: '', budget: 0,
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
          <button
            onClick={() => startAdd(null)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5"
          >
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
          <FilterChip active={!companyFilter} onClick={() => setCompanyFilter(null)} theme={theme}>
            {L.common.all}
          </FilterChip>
          {companies.map(c => (
            <FilterChip key={c.id} active={companyFilter === c.id} onClick={() => setCompanyFilter(c.id)} theme={theme}>
              {c.name_az}
            </FilterChip>
          ))}
        </div>
      )}

      <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
        {companies.filter(c => !companyFilter || c.id === companyFilter).map(c => {
          const rootUnits = (tree[c.id] || []).filter(u => u.parent_id === null)
            .concat((tree['root'] || []).filter(u => u.company_id === c.id));
          // Use a single set to avoid duplicates
          const seen = new Set();
          const uniqueRoots = rootUnits.filter(u => seen.has(u.id) ? false : (seen.add(u.id), true));

          return (
            <div key={c.id} className={`border-b ${theme.border} last:border-0`}>
              <div className={`px-4 py-3 ${theme.surface2} flex items-center justify-between`}>
                <span className="font-bold text-sm">{c.name_az}</span>
                {isAdmin && (
                  <button
                    onClick={() => startAdd({ company_id: c.id, level: 'division', id: null })}
                    className={`text-xs px-2 py-1 rounded border ${theme.border} ${theme.hover} flex items-center gap-1`}
                  >
                    <Plus className="w-3 h-3" /> {L.levels.division}
                  </button>
                )}
              </div>
              <div>
                {uniqueRoots.length === 0 ? (
                  <div className={`px-4 py-6 text-center text-xs ${theme.textFaint}`}>{L.org.treeEmpty}</div>
                ) : (
                  uniqueRoots.map(u => (
                    <TreeNode key={u.id} unit={u} tree={tree} expanded={expanded}
                      onToggle={toggleExpand} onEdit={setEditing} onDelete={setDeleting} onAdd={startAdd}
                      theme={theme} L={L} lang={lang} depth={0}
                      canEdit={isAdmin || canEditBudgets} canManage={isAdmin}
                      showBudgets={showBudgets} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <OrgUnitEditModal L={L} lang={lang} theme={theme} unit={editing}
          companies={companies} orgUnits={orgUnits}
          isAdmin={isAdmin}
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
            <button onClick={doDelete}
              className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">
              {L.actions.delete}
            </button>
            <button onClick={() => setDeleting(null)}
              className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}>
              {L.actions.cancel}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TreeNode({ unit, tree, expanded, onToggle, onEdit, onDelete, onAdd, theme, L, lang, depth, canEdit, canManage, showBudgets }) {
  const children = tree[unit.id] || [];
  const isExpanded = expanded.has(unit.id) || depth < 1;
  const hasChildren = children.length > 0;
  const canAddChild = unit.level !== 'sub_unit';

  return (
    <>
      <div
        className={`flex items-center justify-between px-4 py-2.5 hover:bg-blue-500/5 border-t ${theme.border} text-sm`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasChildren ? (
            <button onClick={() => onToggle(unit.id)} className="-ml-1 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}
          <span className="font-medium truncate">{unit.name_az}</span>
          <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
            unit.level === 'division' ? 'bg-blue-500/10 text-blue-500' :
            unit.level === 'department' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
            'bg-slate-500/10 text-slate-500'
          }`}>
            {L.levels[unit.level]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {showBudgets && (
            <span className={`${theme.textDim} text-xs tabular-nums shrink-0`}>{fmtMoney(unit.budget, lang)} {L.currency}</span>
          )}
          <div className="flex gap-0.5">
            {canManage && canAddChild && (
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
      {isExpanded && children.map(child => (
        <TreeNode key={child.id} unit={child} tree={tree} expanded={expanded}
          onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd}
          theme={theme} L={L} lang={lang} depth={depth + 1}
          canEdit={canEdit} canManage={canManage} showBudgets={showBudgets} />
      ))}
    </>
  );
}

function OrgUnitEditModal({ L, lang, theme, unit, companies, orgUnits, isAdmin, onSave, onClose }) {
  const [u, setU] = useState(unit);

  const parentOptions = useMemo(() => {
    if (!u.company_id) return [];
    return orgUnits
      .filter(o => o.company_id === u.company_id && o.id !== u.id)
      .filter(o => levelOrder(o.level) < levelOrder(u.level));
  }, [u.company_id, u.level, u.id, orgUnits]);

  const valid = u.name_en && u.name_az && u.company_id && u.level;

  return (
    <Modal onClose={onClose} theme={theme} title={u._new ? L.org.add : L.org.edit}>
      <div className="space-y-3">
        {isAdmin && (
          <>
            <Field label={L.emp.company} theme={theme}>
              <select
                value={u.company_id}
                onChange={(e) => setU({ ...u, company_id: e.target.value, parent_id: null })}
                disabled={!u._new}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
              >
                {companies.map(c => <option key={c.id} value={c.id}>{c.name_az}</option>)}
              </select>
            </Field>
            <Field label={L.org.level} theme={theme}>
              <select
                value={u.level}
                onChange={(e) => setU({ ...u, level: e.target.value, parent_id: e.target.value === 'division' ? null : u.parent_id })}
                disabled={!u._new}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
              >
                {LEVELS.map(l => <option key={l} value={l}>{L.levels[l]}</option>)}
              </select>
            </Field>
            <Field label={L.org.parent} theme={theme}>
              <select
                value={u.parent_id || ''}
                onChange={(e) => setU({ ...u, parent_id: e.target.value || null })}
                disabled={u.level === 'division'}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
              >
                <option value="">{L.org.noParent}</option>
                {parentOptions.map(o => (
                  <option key={o.id} value={o.id}>{L.levels[o.level]} · {o.name_az}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label={L.company.nameEn} theme={theme}>
          <input value={u.name_en} onChange={(e) => setU({ ...u, name_en: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>
        <Field label={L.company.nameAz} theme={theme}>
          <input value={u.name_az} onChange={(e) => setU({ ...u, name_az: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>
        <Field label={`${L.common.budget} (${L.currency})`} theme={theme}>
          <input
            type="number"
            value={u.budget}
            onChange={(e) => setU({ ...u, budget: Number(e.target.value) || 0 })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`}
          />
        </Field>
      </div>
      <Buttons onSave={() => onSave(u)} onCancel={onClose} disabled={!valid} L={L} theme={theme} />
    </Modal>
  );
}
