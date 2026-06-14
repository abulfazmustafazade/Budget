import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Edit2, Trash2, AlertTriangle,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons, FilterChip } from '../components/primitives';
import { hasPerm } from '../lib/permissions';

export default function Positions() {
  const { dark, profile, perms, lang } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits }  = useOrgUnits();

  const [summary, setSummary]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [companyFilter, setCompanyFilter] = useState(null);
  const [tab, setTab]                   = useState('list'); // 'list' | 'orgchart'
  const [editing, setEditing]           = useState(null);
  const [deleting, setDeleting]         = useState(null);

  const canManage = profile?.is_admin || hasPerm(profile, perms, 'can_manage_structure');

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_position_summary',
      companyFilter ? { p_company_id: companyFilter } : {}
    );
    setSummary(data || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [companyFilter]);

  // Statistika
  const stats = useMemo(() => ({
    total:  summary.reduce((s, v) => s + v.planned_count, 0),
    filled: summary.reduce((s, v) => s + v.filled_count,  0),
    vacant: summary.reduce((s, v) => s + v.vacant_count,  0),
    avgDays: (() => {
      const vac = summary.filter(v => v.vacant_count > 0);
      return vac.length ? Math.round(vac.reduce((s, v) => s + v.days_vacant, 0) / vac.length) : 0;
    })(),
  }), [summary]);

  // Şirkət üçün kök vəzifələr (parent_id = null)
  const positionsForCompany = (cId) => summary.filter(p => p.company_id === cId);

  // Yarat
  const save = async (p) => {
    const payload = {
      company_id:    p.company_id,
      org_unit_id:   p.org_unit_id || null,
      parent_id:     p.parent_id   || null,
      name:          p.name.trim(),
      planned_count: Number(p.planned_count) || 1,
      opened_at:     p.opened_at,
      notes:         p.notes || null,
    };
    if (p._new) {
      const { error } = await supabase.from('positions').insert(payload);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('positions').update(payload).eq('id', p.id);
      if (error) { alert(error.message); return; }
    }
    setEditing(null);
    refresh();
  };

  const doDelete = async () => {
    const { error } = await supabase.from('positions').delete().eq('id', deleting.position_id);
    if (error) { alert(error.message); return; }
    setDeleting(null);
    refresh();
  };

  const blankPosition = (companyId, parentId = null) => ({
    _new: true,
    company_id:    companyId || companies[0]?.id || '',
    org_unit_id:   '',
    parent_id:     parentId,
    name:          '',
    planned_count: 1,
    opened_at:     new Date().toISOString().slice(0, 10),
    notes:         '',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vəzifələr"
        subtitle={`${stats.vacant} boş / ${stats.total} ümumi`}
        theme={theme}
        action={canManage && companies.length > 0 && (
          <button
            onClick={() => setEditing(blankPosition(companyFilter || companies[0]?.id))}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Vəzifə yarat
          </button>
        )}
      />

      {/* Statistika */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ümumi plan', val: stats.total,   color: 'blue'   },
          { label: 'Dolu',       val: stats.filled,  color: 'emerald'},
          { label: 'Boş',        val: stats.vacant,  color: 'rose'   },
          { label: 'Ort. boş gün', val: stats.avgDays, color: 'amber', suffix: ' gün' },
        ].map(s => (
          <div key={s.label} className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>{s.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${
              s.color === 'blue'    ? 'text-blue-600 dark:text-blue-400' :
              s.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' :
              s.color === 'rose'    ? 'text-rose-600 dark:text-rose-400' :
              'text-amber-600 dark:text-amber-400'
            }`}>{s.val}{s.suffix || ''}</div>
          </div>
        ))}
      </div>

      {/* Tab */}
      <div className={`flex gap-1 p-1 rounded-lg ${theme.surface2} border ${theme.border} w-fit`}>
        {[['list', 'Siyahı'], ['orgchart', 'Org Chart']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              tab === id ? `${theme.surface} shadow-sm ${theme.text}` : theme.textDim
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Şirkət filteri */}
      {companies.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <FilterChip active={!companyFilter} onClick={() => setCompanyFilter(null)} theme={theme}>Hamısı</FilterChip>
          {companies.map(c => (
            <FilterChip key={c.id} active={companyFilter === c.id} onClick={() => setCompanyFilter(c.id)} theme={theme}>
              {c.name_az}
            </FilterChip>
          ))}
        </div>
      )}

      {loading ? (
        <div className={`text-sm ${theme.textDim} text-center py-10`}>Yüklənir...</div>
      ) : tab === 'list' ? (
        /* ── Siyahı görünüşü ── */
        <div className="space-y-4">
          {companies.filter(c => !companyFilter || c.id === companyFilter).map(c => {
            const cPositions = positionsForCompany(c.id);
            if (!cPositions.length && companyFilter) return null;
            return (
              <div key={c.id} className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
                <div className={`px-4 py-3 ${theme.surface2} flex items-center justify-between border-b ${theme.border}`}>
                  <span className="font-bold text-sm">{c.name_az}</span>
                  {canManage && (
                    <button onClick={() => setEditing(blankPosition(c.id))}
                      className={`text-xs px-2 py-1 rounded border ${theme.border} ${theme.hover} flex items-center gap-1`}>
                      <Plus className="w-3 h-3" /> Vəzifə yarat
                    </button>
                  )}
                </div>
                {cPositions.length === 0 ? (
                  <div className={`p-8 text-center text-sm ${theme.textDim}`}>Hələ vəzifə yoxdur</div>
                ) : (
                  <PositionTree
                    positions={cPositions}
                    parentId={null}
                    depth={0}
                    theme={theme}
                    canManage={canManage}
                    onEdit={p => setEditing({ ...p, _edit: true })}
                    onDelete={p => setDeleting(p)}
                    onAddChild={p => setEditing(blankPosition(p.company_id, p.position_id))}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Org Chart görünüşü ── */
        <div className="space-y-8">
          {companies.filter(c => !companyFilter || c.id === companyFilter).map(c => {
            const cPositions = positionsForCompany(c.id);
            if (!cPositions.length) return null;
            return (
              <div key={c.id}>
                <div className={`text-sm font-bold mb-4 ${theme.textDim}`}>{c.name_az}</div>
                <div className="overflow-x-auto pb-4">
                  <OrgChart
                    positions={cPositions}
                    parentId={null}
                    theme={theme}
                    canManage={canManage}
                    onEdit={p => setEditing({ ...p, _edit: true })}
                    onAddChild={p => setEditing(blankPosition(p.company_id, p.position_id))}
                  />
                </div>
              </div>
            );
          })}
          {summary.length === 0 && (
            <div className={`text-sm ${theme.textDim} text-center py-10`}>Hələ vəzifə yoxdur</div>
          )}
        </div>
      )}

      {/* Modallar */}
      {editing && (
        <PositionModal
          theme={theme}
          position={editing}
          companies={companies}
          orgUnits={orgUnits}
          parentOptions={summary}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Modal onClose={() => setDeleting(null)} theme={theme} title="Vəzifəni sil?">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <div className="font-semibold">{deleting.position_name}</div>
              <div className={`text-xs ${theme.textDim} mt-1`}>Bu vəzifə silinəcək. Geri qaytarıla bilməz.</div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={doDelete} className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">Sil</button>
            <button onClick={() => setDeleting(null)} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm`}>Ləğv et</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Siyahı ağacı ────────────────────────────────────────────────────────────
function PositionTree({ positions, parentId, depth, theme, canManage, onEdit, onDelete, onAddChild }) {
  const children = positions.filter(p => p.parent_id === parentId);
  if (!children.length) return null;

  return (
    <>
      {children.map(p => {
        const isVacant = p.vacant_count > 0;
        return (
          <React.Fragment key={p.position_id}>
            <div
              className={`flex items-center gap-3 px-4 py-3 border-t ${theme.border} hover:bg-blue-500/5`}
              style={{ paddingLeft: `${16 + depth * 24}px` }}
            >
              {/* Boşluq/xətt göstəricisi */}
              {depth > 0 && (
                <span className={`text-xs ${theme.textFaint}`}>└</span>
              )}

              {/* Status */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${isVacant ? 'bg-rose-500' : 'bg-emerald-500'}`} />

              {/* Ad */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{p.position_name}</div>
                {p.org_unit_name && (
                  <div className={`text-[11px] ${theme.textFaint}`}>{p.parent_name ? `→ ${p.parent_name}` : ''} · {p.org_unit_name}</div>
                )}
                {p.parent_name && !p.org_unit_name && (
                  <div className={`text-[11px] ${theme.textFaint}`}>→ {p.parent_name}</div>
                )}
              </div>

              {/* Say */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs tabular-nums font-semibold ${isVacant ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {p.filled_count}/{p.planned_count}
                </span>
                {isVacant && p.days_vacant > 0 && (
                  <span className={`flex items-center gap-0.5 text-[11px] tabular-nums ${
                    p.days_vacant > 90 ? 'text-rose-500' : p.days_vacant > 30 ? 'text-amber-500' : theme.textFaint
                  }`}>
                    <Clock className="w-3 h-3" />{p.days_vacant}g
                  </span>
                )}
              </div>

              {/* Əməliyyatlar */}
              {canManage && (
                <div className="flex gap-0.5">
                  <button onClick={() => onAddChild(p)} className={`p-1 rounded ${theme.hover}`} title="Alt vəzifə yarat">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onEdit(p)} className={`p-1 rounded ${theme.hover}`}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(p)} className={`p-1 rounded ${theme.hover} text-rose-500`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <PositionTree
              positions={positions} parentId={p.position_id} depth={depth + 1}
              theme={theme} canManage={canManage}
              onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─── Org Chart ───────────────────────────────────────────────────────────────
function OrgChart({ positions, parentId, theme, canManage, onEdit, onAddChild }) {
  const children = positions.filter(p => p.parent_id === parentId);
  if (!children.length) return null;

  return (
    <div className="flex gap-6 justify-center">
      {children.map(p => {
        const isVacant   = p.vacant_count > 0;
        const hasChildren = positions.some(x => x.parent_id === p.position_id);

        return (
          <div key={p.position_id} className="flex flex-col items-center">
            {/* Kart */}
            <div className={`relative group w-44 rounded-xl border-2 p-3 text-center transition-all ${
              isVacant
                ? `border-rose-400 bg-rose-500/5`
                : `border-emerald-400 bg-emerald-500/5`
            }`}>
              {/* Əməliyyat düymələri — hover-da görünür */}
              {canManage && (
                <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-0.5 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-0.5">
                  <button onClick={() => onAddChild(p)} className={`p-1 rounded ${theme.hover}`} title="Alt vəzifə">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => onEdit(p)} className={`p-1 rounded ${theme.hover}`}>
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Vəzifə adı */}
              <div className="font-bold text-sm leading-tight mb-2">{p.position_name}</div>

              {/* Say göstəricisi */}
              <div className="flex items-center justify-center gap-1.5">
                <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
                  isVacant
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {isVacant ? <XCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                  <span className="tabular-nums">{p.filled_count}/{p.planned_count}</span>
                </div>
              </div>

              {/* Boş gün */}
              {isVacant && p.days_vacant > 0 && (
                <div className={`mt-1 text-[10px] flex items-center justify-center gap-0.5 ${
                  p.days_vacant > 90 ? 'text-rose-500' : p.days_vacant > 30 ? 'text-amber-500' : theme.textFaint
                }`}>
                  <Clock className="w-2.5 h-2.5" />
                  <span className="tabular-nums">{p.days_vacant} gün boşdur</span>
                </div>
              )}

              {/* Org unit */}
              {p.org_unit_name && (
                <div className={`mt-1.5 text-[10px] ${theme.textFaint} truncate`}>{p.org_unit_name}</div>
              )}
            </div>

            {/* Övlad bağlantısı */}
            {hasChildren && (
              <>
                <div className={`w-px h-5 ${theme.border} border-l-2 border-dashed`} />
                <OrgChart
                  positions={positions} parentId={p.position_id}
                  theme={theme} canManage={canManage}
                  onEdit={onEdit} onAddChild={onAddChild}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Ümumi wizard wrapper ─────────────────────────────────────────────────────
function WizardSteps({ steps, current, theme }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = current > n, active = current === n;
        return (
          <React.Fragment key={n}>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                done ? 'bg-emerald-500 text-white' :
                active ? 'bg-blue-600 text-white' :
                `${theme.surface2} border ${theme.border} ${theme.textFaint}`
              }`}>{done ? '✓' : n}</div>
              <span className={`text-xs font-semibold ${active ? theme.text : theme.textFaint}`}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${done ? 'bg-emerald-500' : theme.border.replace('border-','bg-')}`} style={{height:'1px', background: done ? '#10b981' : undefined}} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Org unit ağacı (wizard addım 2 üçün) ────────────────────────────────────
function OrgTreePicker({ orgUnits, companyId, selected, onSelect, theme }) {
  const [open, setOpen] = useState(new Set());
  const L_COLORS = {
    division:'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    department:'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    sub_department:'bg-purple-500/10 text-purple-500',
    unit:'bg-amber-500/10 text-amber-600',
    sub_unit:'bg-slate-500/10 text-slate-500',
  };
  const L_NAMES = {division:'Bölmə',department:'Departament',sub_department:'Alt-dept',unit:'Şöbə',sub_unit:'Alt-şöbə'};

  const units = orgUnits.filter(u => u.company_id === companyId);
  const toggle = id => { const s = new Set(open); s.has(id)?s.delete(id):s.add(id); setOpen(s); };

  const Row = ({ u, depth }) => {
    const children = units.filter(x => x.parent_id === u.id);
    const isOpen = open.has(u.id) || depth < 1;
    return (
      <>
        <button
          onClick={() => onSelect(u.id)}
          className={`w-full text-left flex items-center gap-2 py-2.5 border-b ${theme.border} last:border-0 transition-colors ${
            selected === u.id ? 'bg-blue-500/10' : `hover:bg-blue-500/5`
          }`}
          style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: '12px' }}
        >
          {children.length > 0 ? (
            <span onClick={e => { e.stopPropagation(); toggle(u.id); }}
              className={`w-4 text-center text-xs ${theme.textFaint}`}>
              {isOpen ? '▾' : '▸'}
            </span>
          ) : <span className="w-4" />}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${L_COLORS[u.level]}`}>{L_NAMES[u.level]}</span>
          <span className={`text-sm flex-1 ${selected === u.id ? 'font-bold' : ''}`}>{u.name_az}</span>
          {selected === u.id && <span className="text-blue-500 text-xs font-bold">✓</span>}
        </button>
        {isOpen && children.map(c => <Row key={c.id} u={c} depth={depth + 1} />)}
      </>
    );
  };

  const roots = units.filter(u => !u.parent_id);
  return (
    <div className={`rounded-xl border ${theme.border} overflow-hidden max-h-72 overflow-y-auto`}>
      {roots.length === 0
        ? <div className={`p-6 text-center text-sm ${theme.textDim}`}>Struktur yoxdur. Əvvəlcə "Struktur" bölməsindən bölmə yaradın.</div>
        : roots.map(u => <Row key={u.id} u={u} depth={0} />)
      }
    </div>
  );
}

// ─── Vəzifə wizard ───────────────────────────────────────────────────────────
function PositionModal({ theme, position, companies, orgUnits, parentOptions, onSave, onClose }) {
  const isEdit = !!position._edit;
  const [step, setStep] = useState(isEdit ? 3 : 1);
  const [p, setP] = useState({
    id:            position.position_id,
    company_id:    position.company_id    || companies[0]?.id || '',
    org_unit_id:   position.org_unit_id   || null,
    parent_id:     position.parent_id     || null,
    name:          position.position_name || position.name || '',
    planned_count: position.planned_count || 1,
    opened_at:     position.opened_at     || new Date().toISOString().slice(0, 10),
    notes:         position.notes         || '',
    _new:          !isEdit,
  });

  const selectedOu     = orgUnits.find(u => u.id === p.org_unit_id);
  const selectedParent = parentOptions.find(x => x.position_id === p.parent_id);
  const parentCandidates = parentOptions.filter(x => x.company_id === p.company_id && x.position_id !== p.id);
  const selectedCompany  = companies.find(c => c.id === p.company_id);
  const valid = p.name.trim() && p.company_id && p.planned_count > 0;

  // Org unit yolu
  const getPath = id => {
    const path = []; let cur = orgUnits.find(u => u.id === id);
    while (cur) { path.unshift(cur.name_az); cur = orgUnits.find(u => u.id === cur.parent_id); }
    return path.join(' › ');
  };

  return (
    <Modal onClose={onClose} theme={theme} title={isEdit ? `"${p.name}" — redaktə` : 'Vəzifə yarat'} wide>
      {!isEdit && <WizardSteps steps={['Şirkət', 'Struktur', 'Vəzifə']} current={step} theme={theme} />}

      {/* Addım 1 — Şirkət */}
      {step === 1 && (
        <div className="space-y-2">
          <div className={`text-sm font-semibold mb-3 ${theme.textDim}`}>Hansı şirkət üçün vəzifə yaradırsınız?</div>
          {companies.map(c => (
            <button key={c.id} onClick={() => { setP({ ...p, company_id: c.id, org_unit_id: null, parent_id: null }); setStep(2); }}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all ${
                p.company_id === c.id ? 'border-blue-500 bg-blue-500/5' : `${theme.border} hover:border-blue-300`
              }`}>
              <div>
                <div className="font-bold">{c.name_az}</div>
                <div className={`text-xs ${theme.textDim}`}>{c.name_en}</div>
              </div>
              {p.company_id === c.id && <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">✓</div>}
            </button>
          ))}
        </div>
      )}

      {/* Addım 2 — Struktur */}
      {step === 2 && (
        <div className="space-y-3">
          <div className={`text-sm font-semibold ${theme.textDim}`}>Vəzifə hansı bölməyə aiddir? <span className={`${theme.textFaint} font-normal`}>(istəyə bağlı)</span></div>
          <OrgTreePicker orgUnits={orgUnits} companyId={p.company_id}
            selected={p.org_unit_id} onSelect={id => setP({ ...p, org_unit_id: id })} theme={theme} />
          {p.org_unit_id && (
            <div className={`p-2.5 rounded-lg ${theme.surface2} border ${theme.border} text-xs flex items-center gap-2`}>
              <span className="text-emerald-500">✓</span>
              <span className="font-semibold">{getPath(p.org_unit_id)}</span>
              <button onClick={() => setP({ ...p, org_unit_id: null })} className={`ml-auto text-xs ${theme.textFaint} hover:text-rose-500`}>Sil</button>
            </div>
          )}
          <div className={`text-xs ${theme.textFaint}`}>Bölmə seçmədən də davam edə bilərsiniz</div>
        </div>
      )}

      {/* Addım 3 — Vəzifə detalları */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Xülasə */}
          {!isEdit && (
            <div className={`p-3 rounded-xl ${theme.surface2} border ${theme.border} space-y-1 text-xs`}>
              <div className="flex gap-2"><span className={theme.textFaint}>Şirkət:</span><span className="font-bold">{selectedCompany?.name_az}</span></div>
              {p.org_unit_id && <div className="flex gap-2"><span className={theme.textFaint}>Bölmə:</span><span className="font-semibold">{getPath(p.org_unit_id)}</span></div>}
            </div>
          )}

          {/* Vəzifə adı */}
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Vəzifə adı</div>
            <input value={p.name} onChange={e => setP({ ...p, name: e.target.value })}
              placeholder="Məs: Data Analitik, Direktor, Mühasib..."
              className={`w-full px-3 py-2.5 rounded-lg border ${theme.input} text-sm`} autoFocus />
          </div>

          {/* Kimə bağlıdır */}
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>
              Kimə bağlıdır <span className={`normal-case font-normal ${theme.textFaint}`}>(rəhbər vəzifəsi)</span>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              <button onClick={() => setP({ ...p, parent_id: null })}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                  !p.parent_id ? 'border-blue-500 bg-blue-500/5 font-semibold' : `${theme.border} hover:bg-blue-500/5`
                }`}>
                — Kök vəzifədir (heç kimə bağlı deyil)
              </button>
              {parentCandidates.map(x => (
                <button key={x.position_id} onClick={() => setP({ ...p, parent_id: x.position_id })}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all flex items-center gap-2 ${
                    p.parent_id === x.position_id ? 'border-blue-500 bg-blue-500/5 font-semibold' : `${theme.border} hover:bg-blue-500/5`
                  }`}>
                  <span style={{ paddingLeft: `${x.depth * 12}px` }} className="flex items-center gap-2">
                    {x.depth > 0 && <span className={theme.textFaint}>└</span>}
                    {x.position_name}
                  </span>
                  {p.parent_id === x.position_id && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Plan say + tarix */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Plan say</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setP({ ...p, planned_count: Math.max(0, p.planned_count - 1) })}
                  className={`w-8 h-9 rounded-lg border ${theme.border} ${theme.hover} font-bold text-lg flex items-center justify-center`}>−</button>
                <span className="text-xl font-bold tabular-nums w-8 text-center">{p.planned_count}</span>
                <button onClick={() => setP({ ...p, planned_count: p.planned_count + 1 })}
                  className={`w-8 h-9 rounded-lg border ${theme.border} ${theme.hover} font-bold text-lg flex items-center justify-center`}>+</button>
              </div>
            </div>
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Açılış tarixi</div>
              <input type="date" value={p.opened_at} onChange={e => setP({ ...p, opened_at: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
            </div>
          </div>

          {/* Qeyd */}
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Qeyd <span className={`normal-case font-normal ${theme.textFaint}`}>(istəyə bağlı)</span></div>
            <textarea value={p.notes} onChange={e => setP({ ...p, notes: e.target.value })}
              rows={2} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm resize-none`} />
          </div>
        </div>
      )}

      {/* Naviqasiya */}
      <div className="flex gap-2 mt-5">
        {!isEdit && step > 1 && (
          <button onClick={() => setStep(step - 1)} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}>← Geri</button>
        )}
        {(isEdit || step === 1) && (
          <button onClick={onClose} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}>Ləğv et</button>
        )}
        <div className="flex-1" />
        {!isEdit && step < 3
          ? <button onClick={() => setStep(step + 1)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">İrəli →</button>
          : <button onClick={() => onSave(p)} disabled={!valid} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold">Yadda saxla</button>
        }
      </div>
    </Modal>
  );
}
