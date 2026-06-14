import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, Briefcase, Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons, FilterChip } from '../components/primitives';
import { fmtMoney, hasPerm } from '../lib/permissions';

export default function Positions() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits }  = useOrgUnits();

  const [positionTypes, setPositionTypes]   = useState([]);
  const [vacancySummary, setVacancySummary] = useState([]);
  const [loading, setLoading]               = useState(true);

  const [companyFilter, setCompanyFilter]   = useState(null);
  const [tab, setTab]                       = useState('vacancies'); // 'vacancies' | 'types'

  const [editType, setEditType]         = useState(null);
  const [editHeadcount, setEditHeadcount] = useState(null);
  const [delType, setDelType]           = useState(null);
  const [delHc, setDelHc]               = useState(null);

  const canManage = hasPerm(profile, perms, 'can_manage_structure') || profile?.is_admin;

  const refresh = async () => {
    setLoading(true);
    const [{ data: types }, { data: summary }] = await Promise.all([
      supabase.from('position_types').select('*').order('name_az'),
      supabase.rpc('get_position_vacancy_summary',
        companyFilter ? { p_company_id: companyFilter } : {}
      ),
    ]);
    setPositionTypes(types || []);
    setVacancySummary(summary || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [companyFilter]);

  // Boş vəzifələr — yalnız vacant_count > 0
  const vacancies = useMemo(() =>
    vacancySummary.filter(v => v.vacant_count > 0),
    [vacancySummary]
  );

  // Ümumi statistika
  const stats = useMemo(() => ({
    total:    vacancySummary.reduce((s, v) => s + v.planned_count, 0),
    filled:   vacancySummary.reduce((s, v) => s + v.filled_count, 0),
    vacant:   vacancySummary.reduce((s, v) => s + v.vacant_count, 0),
    avgDays:  vacancies.length
      ? Math.round(vacancies.reduce((s, v) => s + v.days_vacant, 0) / vacancies.length)
      : 0,
  }), [vacancySummary, vacancies]);

  // Vəzifə tipi yarat/yenilə
  const saveType = async (t) => {
    if (t._new) {
      const { error } = await supabase.from('position_types')
        .insert({ name_az: t.name_az, name_en: t.name_en, description: t.description });
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('position_types')
        .update({ name_az: t.name_az, name_en: t.name_en, description: t.description })
        .eq('id', t.id);
      if (error) { alert(error.message); return; }
    }
    setEditType(null);
    refresh();
  };

  // Headcount plan yarat/yenilə
  const saveHeadcount = async (h) => {
    const payload = {
      position_type_id: h.position_type_id,
      org_unit_id:      h.org_unit_id,
      company_id:       h.company_id,
      planned_count:    Number(h.planned_count),
      opened_at:        h.opened_at,
      notes:            h.notes || null,
    };
    if (h._new) {
      const { error } = await supabase.from('position_headcounts').insert(payload);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from('position_headcounts')
        .update(payload).eq('id', h.id);
      if (error) { alert(error.message); return; }
    }
    setEditHeadcount(null);
    refresh();
  };

  const deleteType = async () => {
    const { error } = await supabase.from('position_types').delete().eq('id', delType.id);
    if (error) { alert(error.message); return; }
    setDelType(null); refresh();
  };

  const deleteHc = async () => {
    const { error } = await supabase.from('position_headcounts').delete().eq('id', delHc.id);
    if (error) { alert(error.message); return; }
    setDelHc(null); refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vəzifələr"
        subtitle={`${stats.vacant} boş / ${stats.total} ümumi`}
        theme={theme}
        action={canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditHeadcount({ _new: true, position_type_id: '', org_unit_id: '', company_id: companies[0]?.id || '', planned_count: 1, opened_at: new Date().toISOString().slice(0,10), notes: '' })}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Vəzifə planı
            </button>
          </div>
        )}
      />

      {/* Statistika kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard theme={theme} label="Ümumi plan" value={stats.total} icon={<Briefcase className="w-4 h-4" />} color="blue" />
        <StatCard theme={theme} label="Dolu" value={stats.filled} icon={<CheckCircle className="w-4 h-4" />} color="emerald" />
        <StatCard theme={theme} label="Boş" value={stats.vacant} icon={<XCircle className="w-4 h-4" />} color="rose" />
        <StatCard theme={theme} label="Ort. boş gün" value={stats.avgDays} icon={<Clock className="w-4 h-4" />} color="amber" suffix=" gün" />
      </div>

      {/* Tab keçidi */}
      <div className={`flex gap-1 p-1 rounded-lg ${theme.surface2} border ${theme.border} w-fit`}>
        {[
          { id: 'vacancies', label: 'Boş vəzifələr' },
          { id: 'all',       label: 'Hamısı' },
          { id: 'types',     label: 'Vəzifə tipləri' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              tab === t.id
                ? `${theme.surface} shadow-sm ${theme.text}`
                : theme.textDim
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Şirkət filteri */}
      {companies.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <FilterChip active={!companyFilter} onClick={() => setCompanyFilter(null)} theme={theme}>
            Hamısı
          </FilterChip>
          {companies.map(c => (
            <FilterChip key={c.id} active={companyFilter === c.id} onClick={() => setCompanyFilter(c.id)} theme={theme}>
              {c.name_az}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Boş vəzifələr / Hamısı */}
      {(tab === 'vacancies' || tab === 'all') && (
        <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
          {loading ? (
            <div className={`p-10 text-center text-sm ${theme.textDim}`}>Yüklənir...</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {(tab === 'vacancies' ? vacancies : vacancySummary).map((v, i) => {
                const isVacant = v.vacant_count > 0;
                return (
                  <div key={i} className={`p-4 flex items-start gap-4 ${theme.hover}`}>
                    {/* Status icon */}
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isVacant ? 'bg-rose-500/10' : 'bg-emerald-500/10'
                    }`}>
                      {isVacant
                        ? <XCircle className="w-4 h-4 text-rose-500" />
                        : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </div>

                    {/* Məlumat */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-semibold text-sm">{v.position_name_az}</div>
                          <div className={`text-xs ${theme.textDim} mt-0.5`}>
                            {v.company_name_az} · {v.org_unit_name_az}
                          </div>
                        </div>

                        {/* Say göstəricisi */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-center">
                            <div className="text-xs font-bold tabular-nums">{v.filled_count}/{v.planned_count}</div>
                            <div className={`text-[10px] ${theme.textFaint}`}>dolu/plan</div>
                          </div>
                          {isVacant && (
                            <div className={`px-2 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-center`}>
                              <div className="text-sm font-bold tabular-nums">{v.vacant_count}</div>
                              <div className="text-[10px]">boş</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className={`flex-1 h-1.5 rounded-full ${theme.surface2} overflow-hidden`}>
                          <div
                            className={`h-full rounded-full ${isVacant ? 'bg-rose-400' : 'bg-emerald-500'}`}
                            style={{ width: `${v.planned_count > 0 ? (v.filled_count / v.planned_count) * 100 : 0}%` }}
                          />
                        </div>

                        {/* Boş qalan gün */}
                        {isVacant && v.days_vacant > 0 && (
                          <div className={`flex items-center gap-1 text-xs ${
                            v.days_vacant > 90 ? 'text-rose-500' :
                            v.days_vacant > 30 ? 'text-amber-500' : theme.textFaint
                          }`}>
                            <Clock className="w-3 h-3" />
                            <span className="tabular-nums">{v.days_vacant} gün</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Redaktə */}
                    {canManage && (
                      <button
                        onClick={async () => {
                          const { data } = await supabase
                            .from('position_headcounts')
                            .select('*')
                            .eq('position_type_id', v.position_type_id)
                            .eq('org_unit_id', v.org_unit_id)
                            .single();
                          if (data) setEditHeadcount(data);
                        }}
                        className={`p-1.5 rounded-md ${theme.hover} shrink-0`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}

              {(tab === 'vacancies' ? vacancies : vacancySummary).length === 0 && (
                <div className={`p-10 text-center text-sm ${theme.textDim}`}>
                  {tab === 'vacancies' ? '✓ Bütün vəzifələr doludur' : 'Heç bir vəzifə planı yoxdur'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Vəzifə tipləri */}
      {tab === 'types' && (
        <div className="space-y-3">
          {canManage && (
            <button
              onClick={() => setEditType({ _new: true, name_az: '', name_en: '', description: '' })}
              className={`w-full py-2.5 rounded-lg border-2 border-dashed ${theme.border} ${theme.textDim} text-sm ${theme.hover} flex items-center justify-center gap-2`}
            >
              <Plus className="w-4 h-4" /> Yeni vəzifə tipi
            </button>
          )}
          <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {positionTypes.map(pt => {
                const managerPt = positionTypes.find(p => p.id === pt.manager_position_type_id);
                return (
                  <div key={pt.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${theme.hover}`}>
                    <div>
                      <div className="font-semibold text-sm">{pt.name_az}</div>
                      {pt.name_en && <div className={`text-xs ${theme.textDim}`}>{pt.name_en}</div>}
                      {managerPt && (
                        <div className={`text-xs mt-0.5 flex items-center gap-1`}>
                          <span className={theme.textFaint}>Rəhbər:</span>
                          <span className="text-blue-500 font-medium">{managerPt.name_az}</span>
                        </div>
                      )}
                      {pt.description && <div className={`text-xs ${theme.textFaint} mt-0.5`}>{pt.description}</div>}
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditType({ ...pt })} className={`p-1.5 rounded-md ${theme.hover}`}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDelType(pt)} className={`p-1.5 rounded-md ${theme.hover} text-rose-500`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {positionTypes.length === 0 && (
                <div className={`p-8 text-center text-sm ${theme.textDim}`}>Hələ vəzifə tipi yoxdur</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modallar */}
      {editType && (
        <PositionTypeModal theme={theme} type={editType} positionTypes={positionTypes} onSave={saveType} onClose={() => setEditType(null)} />
      )}
      {editHeadcount && (
        <HeadcountModal
          theme={theme} lang={lang} headcount={editHeadcount}
          positionTypes={positionTypes} companies={companies} orgUnits={orgUnits}
          onSave={saveHeadcount} onClose={() => setEditHeadcount(null)}
        />
      )}
      {delType && (
        <ConfirmModal theme={theme} title={delType.name_az} onConfirm={deleteType} onClose={() => setDelType(null)} />
      )}
      {delHc && (
        <ConfirmModal theme={theme} title={`${delHc.position_name_az} planını sil`} onConfirm={deleteHc} onClose={() => setDelHc(null)} />
      )}
    </div>
  );
}

// ─── Stat kartı ──────────────────────────────────────────────────────────────
function StatCard({ theme, label, value, icon, color, suffix = '' }) {
  const colors = {
    blue:   'text-blue-600 dark:text-blue-400',
    emerald:'text-emerald-600 dark:text-emerald-400',
    rose:   'text-rose-600 dark:text-rose-400',
    amber:  'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${theme.textDim}`}>
        {icon} {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${colors[color]}`}>
        {value}{suffix}
      </div>
    </div>
  );
}

// ─── Vəzifə tipi modal ───────────────────────────────────────────────────────
function PositionTypeModal({ theme, type, positionTypes, onSave, onClose }) {
  const [t, setT] = useState(type);
  const valid = t.name_az && t.name_en;
  const L = { actions: { save: 'Yadda saxla', cancel: 'Ləğv et' } };

  // Özünü rəhbər kimi seçməsin
  const managerOptions = positionTypes.filter(p => p.id !== t.id);

  return (
    <Modal onClose={onClose} theme={theme} title={t._new ? 'Yeni vəzifə tipi' : 'Vəzifə tipini redaktə et'}>
      <div className="space-y-3">
        <Field label="Ad (Azərbaycan)" theme={theme}>
          <input value={t.name_az} onChange={e => setT({ ...t, name_az: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>
        <Field label="Ad (İngilis)" theme={theme}>
          <input value={t.name_en} onChange={e => setT({ ...t, name_en: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>
        <Field label="Birbaşa rəhbər vəzifəsi" theme={theme}>
          <select
            value={t.manager_position_type_id || ''}
            onChange={e => setT({ ...t, manager_position_type_id: e.target.value || null })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
          >
            <option value="">— rəhbər yoxdur —</option>
            {managerOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name_az}</option>
            ))}
          </select>
          <div className={`text-[11px] mt-1 ${theme.textFaint}`}>
            Məs: "Data Analitik" → rəhbəri "Şöbə Müdiri"
          </div>
        </Field>
        <Field label="Qeyd (istəyə bağlı)" theme={theme}>
          <textarea value={t.description || ''} onChange={e => setT({ ...t, description: e.target.value })}
            rows={2} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm resize-none`} />
        </Field>
      </div>
      <Buttons onSave={() => onSave(t)} onCancel={onClose} disabled={!valid} L={L} theme={theme} />
    </Modal>
  );
}

// ─── Headcount Wizard — addım-addım ──────────────────────────────────────────
function HeadcountModal({ theme, lang, headcount, positionTypes, companies, orgUnits, onSave, onClose }) {
  const isEdit = !headcount._new;

  // Redaktə rejimində birbaşa addım 3-dən başla
  const [step, setStep] = useState(isEdit ? 3 : 1);

  const [h, setH] = useState({
    company_id:       headcount.company_id || companies[0]?.id || '',
    org_unit_id:      headcount.org_unit_id || '',
    position_type_id: headcount.position_type_id || '',
    planned_count:    headcount.planned_count || 1,
    opened_at:        headcount.opened_at || new Date().toISOString().slice(0, 10),
    notes:            headcount.notes || '',
    id:               headcount.id,
    _new:             headcount._new,
  });

  // Seçilmiş şirkətin org unitləri — ağac qur
  const companyOrgUnits = orgUnits.filter(u => u.company_id === h.company_id);

  // Org unit ağacı qurmaq üçün yardımçı
  const buildTree = (parentId = null) =>
    companyOrgUnits
      .filter(u => u.parent_id === parentId)
      .map(u => ({ ...u, children: buildTree(u.id) }));

  const tree = buildTree(null);

  // Seçilmiş org unitin tam yolu
  const getPath = (unitId) => {
    const path = [];
    let cur = orgUnits.find(u => u.id === unitId);
    while (cur) { path.unshift(cur.name_az); cur = orgUnits.find(u => u.id === cur.parent_id); }
    return path;
  };

  const selectedOu      = orgUnits.find(u => u.id === h.org_unit_id);
  const selectedPt      = positionTypes.find(p => p.id === h.position_type_id);
  const managerPt       = positionTypes.find(p => p.id === selectedPt?.manager_position_type_id);
  const ouPath          = h.org_unit_id ? getPath(h.org_unit_id) : [];

  const LEVEL_COLORS = {
    division:       'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    department:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    sub_department: 'bg-purple-500/10 text-purple-500',
    unit:           'bg-amber-500/10 text-amber-600',
    sub_unit:       'bg-slate-500/10 text-slate-500',
  };

  const LEVEL_NAMES = {
    division: 'Bölmə', department: 'Departament',
    sub_department: 'Alt-departament', unit: 'Şöbə', sub_unit: 'Alt-şöbə',
  };

  const valid = h.company_id && h.org_unit_id && h.position_type_id && h.planned_count > 0;

  // Addım başlıqları
  const steps = ['Şirkət', 'Struktur', 'Vəzifə'];

  return (
    <Modal onClose={onClose} theme={theme} title={isEdit ? 'Vəzifə planını redaktə et' : 'Vəzifə planı yarat'} wide>

      {/* Progress bar — yalnız yeni yaradanda */}
      {!isEdit && (
        <div className="flex items-center gap-2 mb-6">
          {steps.map((s, i) => {
            const n = i + 1;
            const done   = step > n;
            const active = step === n;
            return (
              <React.Fragment key={n}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    done   ? 'bg-emerald-500 text-white' :
                    active ? 'bg-blue-600 text-white' :
                    `${theme.surface2} border ${theme.border} ${theme.textFaint}`
                  }`}>
                    {done ? '✓' : n}
                  </div>
                  <span className={`text-xs font-semibold ${active ? theme.text : theme.textFaint}`}>{s}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px ${step > n ? 'bg-emerald-500' : theme.border} border-0 bg-current`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ── Addım 1: Şirkət ── */}
      {step === 1 && (
        <div className="space-y-2">
          <div className={`text-sm font-semibold mb-3 ${theme.textDim}`}>Hansı şirkət üçün vəzifə planı yaradırsınız?</div>
          {companies.map(c => (
            <button key={c.id}
              onClick={() => { setH({ ...h, company_id: c.id, org_unit_id: '' }); setStep(2); }}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                h.company_id === c.id
                  ? 'border-blue-500 bg-blue-500/5'
                  : `${theme.border} ${theme.hover}`
              }`}>
              <div>
                <div className="font-bold">{c.name_az}</div>
                <div className={`text-xs ${theme.textDim} mt-0.5`}>{c.name_en}</div>
              </div>
              {h.company_id === c.id && <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">✓</div>}
            </button>
          ))}
        </div>
      )}

      {/* ── Addım 2: Struktur (ağac) ── */}
      {step === 2 && (
        <div>
          <div className={`text-sm font-semibold mb-3 ${theme.textDim}`}>
            Hansı bölməyə vəzifə planı əlavə edilsin?
          </div>
          <div className={`rounded-xl border ${theme.border} overflow-hidden max-h-80 overflow-y-auto`}>
            {tree.length === 0 ? (
              <div className={`p-6 text-center text-sm ${theme.textDim}`}>
                Bu şirkətin strukturu yoxdur. Əvvəlcə "Struktur" bölməsindən bölmə yaradın.
              </div>
            ) : (
              tree.map(u => (
                <OrgTreeRow key={u.id} unit={u} depth={0}
                  selected={h.org_unit_id}
                  onSelect={(id) => setH({ ...h, org_unit_id: id })}
                  theme={theme} levelColors={LEVEL_COLORS} levelNames={LEVEL_NAMES} />
              ))
            )}
          </div>
          {h.org_unit_id && (
            <div className={`mt-3 p-2.5 rounded-lg ${theme.surface2} border ${theme.border} text-xs flex items-center gap-2`}>
              <span className="text-emerald-500">✓</span>
              <span className={theme.textDim}>Seçildi:</span>
              <span className="font-semibold">{ouPath.join(' › ')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Addım 3: Vəzifə detalları ── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Xülasə: şirkət + bölmə */}
          {!isEdit && (
            <div className={`p-3 rounded-xl ${theme.surface2} border ${theme.border} space-y-1`}>
              <div className="flex items-center gap-2 text-xs">
                <span className={theme.textFaint}>Şirkət:</span>
                <span className="font-semibold">{companies.find(c => c.id === h.company_id)?.name_az}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className={theme.textFaint}>Bölmə:</span>
                <span className="font-semibold">{ouPath.join(' › ')}</span>
              </div>
            </div>
          )}

          {/* Vəzifə tipi */}
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${theme.textDim}`}>Vəzifə</div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {positionTypes.map(pt => {
                const mgr = positionTypes.find(p => p.id === pt.manager_position_type_id);
                return (
                  <button key={pt.id}
                    onClick={() => setH({ ...h, position_type_id: pt.id })}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center justify-between ${
                      h.position_type_id === pt.id
                        ? 'border-blue-500 bg-blue-500/5'
                        : `${theme.border} ${theme.hover}`
                    }`}>
                    <div>
                      <div className="text-sm font-semibold">{pt.name_az}</div>
                      {mgr && <div className={`text-[11px] ${theme.textFaint} mt-0.5`}>Rəhbər: {mgr.name_az}</div>}
                    </div>
                    {h.position_type_id === pt.id && (
                      <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] shrink-0">✓</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plan say + tarix */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Plan say</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setH({ ...h, planned_count: Math.max(1, h.planned_count - 1) })}
                  className={`w-8 h-8 rounded-lg border ${theme.border} ${theme.hover} font-bold text-lg flex items-center justify-center`}>−</button>
                <span className="text-xl font-bold tabular-nums w-8 text-center">{h.planned_count}</span>
                <button onClick={() => setH({ ...h, planned_count: h.planned_count + 1 })}
                  className={`w-8 h-8 rounded-lg border ${theme.border} ${theme.hover} font-bold text-lg flex items-center justify-center`}>+</button>
              </div>
            </div>
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Açılış tarixi</div>
              <input type="date" value={h.opened_at}
                onChange={e => setH({ ...h, opened_at: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
            </div>
          </div>

          {/* Qeyd */}
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme.textDim}`}>Qeyd (istəyə bağlı)</div>
            <textarea value={h.notes} onChange={e => setH({ ...h, notes: e.target.value })}
              rows={2} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm resize-none`} />
          </div>
        </div>
      )}

      {/* Alt naviqasiya */}
      <div className="flex gap-2 mt-5">
        {step > 1 && !isEdit && (
          <button onClick={() => setStep(step - 1)}
            className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}>
            ← Geri
          </button>
        )}
        <button onClick={onClose}
          className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium ${step === 1 || isEdit ? '' : 'hidden'}`}>
          Ləğv et
        </button>
        <div className="flex-1" />
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 ? !h.company_id : !h.org_unit_id}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold"
          >
            İrəli →
          </button>
        ) : (
          <button
            onClick={() => onSave(h)}
            disabled={!valid}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold"
          >
            Yadda saxla
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Org ağac sırası ──────────────────────────────────────────────────────────
function OrgTreeRow({ unit, depth, selected, onSelect, theme, levelColors, levelNames }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = unit.children?.length > 0;
  const isSelected  = selected === unit.id;

  return (
    <>
      <button
        onClick={() => onSelect(unit.id)}
        className={`w-full text-left flex items-center gap-2 px-3 py-2.5 border-b ${theme.border} last:border-0 transition-colors ${
          isSelected ? 'bg-blue-500/10' : `hover:bg-blue-500/5`
        }`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          <span onClick={e => { e.stopPropagation(); setOpen(!open); }}
            className={`w-4 h-4 flex items-center justify-center ${theme.textFaint} hover:text-current`}>
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${levelColors[unit.level]}`}>
          {levelNames[unit.level]}
        </span>
        <span className={`text-sm flex-1 ${isSelected ? 'font-bold' : ''}`}>{unit.name_az}</span>
        {isSelected && <span className="text-blue-500 text-xs font-bold">✓</span>}
      </button>
      {open && hasChildren && unit.children.map(child => (
        <OrgTreeRow key={child.id} unit={child} depth={depth + 1}
          selected={selected} onSelect={onSelect}
          theme={theme} levelColors={levelColors} levelNames={levelNames} />
      ))}
    </>
  );
}

// ─── Silmə təsdiqi ───────────────────────────────────────────────────────────
function ConfirmModal({ theme, title, onConfirm, onClose }) {
  return (
    <Modal onClose={onClose} theme={theme} title="Silinsin?">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <div className={`text-xs mt-1 ${theme.textDim}`}>Bu əməliyyat geri qaytarıla bilməz.</div>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">Sil</button>
        <button onClick={onClose} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm`}>Ləğv et</button>
      </div>
    </Modal>
  );
}
