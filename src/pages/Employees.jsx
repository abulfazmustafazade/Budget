import React, { useState, useMemo, useEffect } from 'react';
import { Plus, TrendingUp, ArrowRightLeft, UserMinus, Check, Briefcase, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits, useEmployees } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, FilterChip, Modal, Field, Buttons } from '../components/primitives';
import { fmtMoney, canSeeField, hasPerm, toISO } from '../lib/permissions';

const YEAR = new Date().getFullYear();
const parseDate = (s) => (s instanceof Date ? s : new Date(s));

function salaryOn(emp, date) {
  const d = parseDate(date);
  const sorted = [...(emp.salary_history || [])].sort((a, b) => parseDate(a.effective_date) - parseDate(b.effective_date));
  let cur = sorted[0]?.amount ?? 0;
  for (const s of sorted) if (parseDate(s.effective_date) <= d) cur = s.amount;
  return cur;
}

function positionOn(emp, date) {
  const d = parseDate(date);
  const sorted = [...(emp.position_history || [])].sort((a, b) => parseDate(a.effective_date) - parseDate(b.effective_date));
  let cur = sorted[0]?.position ?? '';
  for (const p of sorted) if (parseDate(p.effective_date) <= d) cur = p.position;
  return cur;
}

function currentAssignment(emp) {
  return (emp.assignments || []).find(a => !a.to_date) || (emp.assignments || []).at(-1);
}

export default function Employees() {
  const { L, lang, dark, profile, perms } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits } = useOrgUnits();
  const { data: employees, refresh } = useEmployees();

  const [orgFilter, setOrgFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [salaryDlg, setSalaryDlg] = useState(null);
  const [positionDlg, setPositionDlg] = useState(null);
  const [transferDlg, setTransferDlg] = useState(null);
  const [termDlg, setTermDlg] = useState(null);
  const [historyEmp, setHistoryEmp] = useState(null);

  const canEdit     = hasPerm(profile, perms, 'can_edit_employees');
  const canEditSal  = hasPerm(profile, perms, 'can_edit_salaries');
  const canEditPos  = hasPerm(profile, perms, 'can_edit_positions');
  const canTransfer = hasPerm(profile, perms, 'can_transfer_employees');
  const canTerminate= hasPerm(profile, perms, 'can_terminate_employees');
  const showSalaries= canSeeField(profile, perms, 'see_salaries');
  const showPayouts = canSeeField(profile, perms, 'see_termination_payouts');

  // Org unit ağacını aşağı topla: seçilmiş unit + bütün övladları
  const getDescendantIds = (unitId) => {
    const ids = new Set([unitId]);
    const add = (id) => {
      orgUnits.filter(u => u.parent_id === id).forEach(u => { ids.add(u.id); add(u.id); });
    };
    add(unitId);
    return ids;
  };

  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (orgFilter === 'all') return true;
      const cur = currentAssignment(e);
      if (!cur) return false;
      // Seçilmiş unit VƏ onun bütün övladları
      return getDescendantIds(orgFilter).has(cur.org_unit_id);
    }).sort((a, b) => (a.end_date ? 1 : -1) - (b.end_date ? 1 : -1));
  }, [employees, orgFilter, orgUnits]);

  // Excel export
  const exportExcel = () => {
    const rows = filtered.map(emp => {
      const cur = currentAssignment(emp);
      const ou = orgUnits.find(u => u.id === cur?.org_unit_id);
      const co = companies.find(c => c.id === cur?.company_id);
      const salary = salaryOn(emp, emp.end_date || new Date());
      const position = positionOn(emp, emp.end_date || new Date());
      return {
        'Ad': emp.full_name,
        'Vəzifə': position,
        'Şirkət': co?.name_az || '',
        'Bölmə': ou?.name_az || '',
        'Aylıq maaş': salary,
        'İşə başlama': emp.hire_date,
        'Status': emp.end_date ? 'İşdən çıxmış' : 'Aktiv',
        'Çıxış tarixi': emp.end_date || '',
      };
    });

    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iscilar_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addEmployee = async (d) => {
    const { data: emp, error } = await supabase.from('employees')
      .insert({ full_name: d.full_name, hire_date: d.start_date }).select().single();
    if (error) { alert(error.message); return; }
    await Promise.all([
      supabase.from('assignments').insert({ employee_id: emp.id, company_id: d.company_id, org_unit_id: d.org_unit_id, from_date: d.start_date }),
      supabase.from('salary_history').insert({ employee_id: emp.id, effective_date: d.start_date, amount: Number(d.salary) }),
      supabase.from('position_history').insert({ employee_id: emp.id, effective_date: d.start_date, position: d.position }),
    ]);
    setAddOpen(false);
    refresh();
  };

  const changeSalary = async (emp, eff, amt) => {
    const { error } = await supabase.from('salary_history').insert({ employee_id: emp.id, effective_date: eff, amount: Number(amt) });
    if (error) alert(error.message);
    setSalaryDlg(null); refresh();
  };

  const changePosition = async (emp, eff, pos) => {
    const { error } = await supabase.from('position_history').insert({ employee_id: emp.id, effective_date: eff, position: pos });
    if (error) alert(error.message);
    setPositionDlg(null); refresh();
  };

  const transfer = async (emp, date, compId, ouId, newSalary) => {
    const { error } = await supabase.rpc('transfer_employee', {
      p_employee_id: emp.id, p_new_company_id: compId,
      p_new_org_unit_id: ouId, p_transfer_date: date,
      p_new_salary: newSalary ? Number(newSalary) : null,
    });
    if (error) alert(error.message);
    setTransferDlg(null); refresh();
  };

  const terminate = async (emp, endDate, override) => {
    await supabase.from('employees').update({
      end_date: endDate,
      termination_vacation_override: override?.vacation ?? null,
      termination_compensation_override: override?.compensation ?? null,
    }).eq('id', emp.id);
    setTermDlg(null); refresh();
  };

  const reactivate = async (emp) => {
    await supabase.from('employees').update({ end_date: null, termination_vacation_override: null, termination_compensation_override: null }).eq('id', emp.id);
    refresh();
  };

  // Yalnız kök (parent_id=null) org unitlər filterbar üçün
  const rootOrgUnits = orgUnits.filter(u => u.parent_id === null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.emp.title}
        subtitle={`${filtered.length}`}
        theme={theme}
        action={
          <div className="flex gap-2">
            <button onClick={exportExcel}
              className={`px-3 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-semibold flex items-center gap-1.5`}>
              <Download className="w-4 h-4" /> Export
            </button>
            {canEdit && orgUnits.length > 0 && (
              <button onClick={() => setAddOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5">
                <Plus className="w-4 h-4" />{L.emp.add}
              </button>
            )}
          </div>
        }
      />

      {/* Yalnız şirkət+division səviyyəsini göstər filtrdə */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <FilterChip active={orgFilter === 'all'} onClick={() => setOrgFilter('all')} theme={theme}>
          {L.common.all}
        </FilterChip>
        {companies.map(c => (
          <React.Fragment key={c.id}>
            {orgUnits.filter(u => u.company_id === c.id && !u.parent_id).map(u => (
              <FilterChip key={u.id} active={orgFilter === u.id} onClick={() => setOrgFilter(u.id)} theme={theme}>
                {c.name_az} · {u.name_az}
              </FilterChip>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filtered.map(emp => {
            const cur = currentAssignment(emp);
            const curOu = orgUnits.find(u => u.id === cur?.org_unit_id);
            const curCo = companies.find(c => c.id === cur?.company_id);
            const salary = salaryOn(emp, emp.end_date || new Date());
            const position = positionOn(emp, emp.end_date || new Date());

            // Org unit yolu (breadcrumb)
            const getPath = (unitId) => {
              const path = [];
              let current = orgUnits.find(u => u.id === unitId);
              while (current) {
                path.unshift(current.name_az);
                current = orgUnits.find(u => u.id === current.parent_id);
              }
              return path.join(' › ');
            };

            return (
              <div key={emp.id} className={`p-4 ${theme.hover}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${emp.end_date ? 'from-slate-400 to-slate-500' : 'from-blue-500 to-emerald-500'} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                    {emp.full_name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-2 flex-wrap">
                          {emp.full_name}
                          {emp.end_date && (
                            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500">
                              {L.emp.terminated}
                            </span>
                          )}
                        </div>
                        <div className={`text-xs ${theme.textDim}`}>{position}</div>
                        <div className={`text-[11px] ${theme.textFaint} mt-0.5`}>
                          {curCo?.name_az} · {curOu ? getPath(curOu.id) : ''}
                        </div>
                      </div>
                      {showSalaries && (
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular-nums">{fmtMoney(salary, lang)}</div>
                          <div className={`text-[11px] ${theme.textDim}`}>{L.currency}/ay</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {/* Tarixçə düyməsi */}
                      <ActionBtn onClick={() => setHistoryEmp(emp)} theme={theme}>
                        Tarixçə
                      </ActionBtn>

                      {!emp.end_date ? (
                        <>
                          {canEditSal && <ActionBtn onClick={() => setSalaryDlg(emp)} theme={theme} icon={TrendingUp}>{L.emp.editSalary}</ActionBtn>}
                          {canEditPos && <ActionBtn onClick={() => setPositionDlg(emp)} theme={theme} icon={Briefcase}>{L.emp.editPosition}</ActionBtn>}
                          {canTransfer && <ActionBtn onClick={() => setTransferDlg(emp)} theme={theme} icon={ArrowRightLeft}>{L.emp.transfer}</ActionBtn>}
                          {canTerminate && <ActionBtn onClick={() => setTermDlg(emp)} theme={theme} icon={UserMinus} variant="danger">{L.emp.terminate}</ActionBtn>}
                        </>
                      ) : (
                        canTerminate && <ActionBtn onClick={() => reactivate(emp)} theme={theme} icon={Check}>{L.emp.reactivate}</ActionBtn>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className={`p-10 text-center ${theme.textDim} text-sm`}>{L.empty}</div>
          )}
        </div>
      </div>

      {addOpen && <AddEmployeeModal L={L} theme={theme} lang={lang} companies={companies} orgUnits={orgUnits} onSave={addEmployee} onClose={() => setAddOpen(false)} />}
      {salaryDlg && <SalaryChangeModal L={L} theme={theme} emp={salaryDlg} onSave={(e,a) => changeSalary(salaryDlg,e,a)} onClose={() => setSalaryDlg(null)} />}
      {positionDlg && <PositionChangeModal L={L} theme={theme} emp={positionDlg} onSave={(e,p) => changePosition(positionDlg,e,p)} onClose={() => setPositionDlg(null)} />}
      {transferDlg && <TransferModal L={L} lang={lang} theme={theme} emp={transferDlg} companies={companies} orgUnits={orgUnits} canEditSal={canEditSal} onSave={(d,c,ou,s) => transfer(transferDlg,d,c,ou,s)} onClose={() => setTransferDlg(null)} />}
      {termDlg && <TerminationModal L={L} lang={lang} theme={theme} emp={termDlg} canOverride={hasPerm(profile,perms,'can_override_payouts')} onSave={(d,o) => terminate(termDlg,d,o)} onClose={() => setTermDlg(null)} />}
      {historyEmp && <HistoryModal L={L} lang={lang} theme={theme} emp={historyEmp} companies={companies} orgUnits={orgUnits} showSalaries={showSalaries} onClose={() => setHistoryEmp(null)} />}
    </div>
  );
}

function ActionBtn({ children, onClick, icon: Icon, variant, theme }) {
  const s = variant === 'danger' ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10' : `${theme.textDim} ${theme.hover}`;
  return (
    <button onClick={onClick} className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border ${theme.border} ${s} flex items-center gap-1.5`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}{children}
    </button>
  );
}

// ── Tarixçə Modal ────────────────────────────────────────────────────────────
function HistoryModal({ L, lang, theme, emp, companies, orgUnits, showSalaries, onClose }) {
  const getOuPath = (unitId) => {
    const path = [];
    let cur = orgUnits.find(u => u.id === unitId);
    while (cur) { path.unshift(cur.name_az); cur = orgUnits.find(u => u.id === cur.parent_id); }
    return path.join(' › ');
  };

  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · Tarixçə`} wide>
      <div className="space-y-5">
        {/* Təyinat tarixçəsi */}
        <div>
          <div className={`text-[11px] font-bold uppercase tracking-wider ${theme.textDim} mb-2`}>Təyinat tarixçəsi</div>
          <div className="space-y-2">
            {(emp.assignments || []).sort((a,b) => new Date(a.from_date)-new Date(b.from_date)).map((a, i) => {
              const co = companies.find(c => c.id === a.company_id);
              return (
                <div key={i} className={`p-3 rounded-lg border ${theme.border} ${theme.surface2} text-sm`}>
                  <div className="font-semibold">{co?.name_az} · {getOuPath(a.org_unit_id)}</div>
                  <div className={`text-xs ${theme.textDim} mt-0.5`}>
                    {a.from_date} — {a.to_date || (emp.end_date || 'indiyə qədər')}
                  </div>
                </div>
              );
            })}
            {!(emp.assignments?.length) && <div className={`text-xs ${theme.textFaint}`}>Yoxdur</div>}
          </div>
        </div>

        {/* Vəzifə tarixçəsi */}
        <div>
          <div className={`text-[11px] font-bold uppercase tracking-wider ${theme.textDim} mb-2`}>Vəzifə tarixçəsi</div>
          <div className="space-y-2">
            {(emp.position_history || []).sort((a,b) => new Date(a.effective_date)-new Date(b.effective_date)).map((p, i) => (
              <div key={i} className={`flex justify-between p-2.5 rounded-lg border ${theme.border} ${theme.surface2} text-sm`}>
                <span className="font-medium">{p.position}</span>
                <span className={theme.textDim}>{p.effective_date}</span>
              </div>
            ))}
            {!(emp.position_history?.length) && <div className={`text-xs ${theme.textFaint}`}>Yoxdur</div>}
          </div>
        </div>

        {/* Maaş tarixçəsi */}
        {showSalaries && (
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider ${theme.textDim} mb-2`}>Maaş tarixçəsi</div>
            <div className="space-y-2">
              {(emp.salary_history || []).sort((a,b) => new Date(a.effective_date)-new Date(b.effective_date)).map((s, i) => (
                <div key={i} className={`flex justify-between p-2.5 rounded-lg border ${theme.border} ${theme.surface2} text-sm`}>
                  <span className="font-bold tabular-nums">{fmtMoney(s.amount, lang)} AZN/ay</span>
                  <span className={theme.textDim}>{s.effective_date}</span>
                </div>
              ))}
              {!(emp.salary_history?.length) && <div className={`text-xs ${theme.textFaint}`}>Yoxdur</div>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Digər Modallar ───────────────────────────────────────────────────────────
function AddEmployeeModal({ L, theme, lang, companies, orgUnits, onSave, onClose }) {
  const [d, setD] = useState({
    full_name: '', position: '', company_id: companies[0]?.id || '',
    org_unit_id: '', salary: '', start_date: toISO(new Date()),
  });
  const [unitPositions, setUnitPositions] = useState([]);
  const [loadingPos, setLoadingPos] = useState(false);

  // Org unit seçiləndə həmin unit üçün vəzifə adlarını yüklə
  useEffect(() => {
    if (!d.org_unit_id) { setUnitPositions([]); return; }
    (async () => {
      setLoadingPos(true);
      const { data } = await supabase
        .from('position_headcounts')
        .select('position_name, manager_name, planned_count')
        .eq('org_unit_id', d.org_unit_id)
        .not('position_name', 'is', null);
      setUnitPositions(data || []);
      setLoadingPos(false);
    })();
  }, [d.org_unit_id]);

  const filteredOus = orgUnits.filter(u => u.company_id === d.company_id);
  const valid = d.full_name && d.position && d.salary && d.start_date && d.org_unit_id;
  const selectedPos = unitPositions.find(p => p.position_name === d.position);

  return (
    <Modal onClose={onClose} theme={theme} title={L.emp.add}>
      <div className="space-y-3">
        <Field label={L.emp.name} theme={theme}>
          <input value={d.full_name} onChange={e => setD({ ...d, full_name: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={L.emp.company} theme={theme}>
            <select value={d.company_id}
              onChange={e => setD({ ...d, company_id: e.target.value, org_unit_id: '', position: '' })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name_az}</option>)}
            </select>
          </Field>
          <Field label={L.emp.orgUnit} theme={theme}>
            <select value={d.org_unit_id}
              onChange={e => setD({ ...d, org_unit_id: e.target.value, position: '' })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              <option value="">— seçin —</option>
              {filteredOus.map(u => <option key={u.id} value={u.id}>{L.levels[u.level]} · {u.name_az}</option>)}
            </select>
          </Field>
        </div>

        <Field label={L.emp.position} theme={theme}>
          {!d.org_unit_id ? (
            <div className={`px-3 py-2.5 rounded-lg border ${theme.border} text-sm ${theme.textFaint}`}>
              Əvvəlcə bölmə seçin
            </div>
          ) : loadingPos ? (
            <div className={`px-3 py-2.5 text-sm ${theme.textDim}`}>Yüklənir...</div>
          ) : unitPositions.length === 0 ? (
            <div className={`px-3 py-2.5 text-sm text-amber-500 border border-amber-500/30 rounded-lg bg-amber-500/5`}>
              ⚠ Bu bölmə üçün vəzifə planı yoxdur. Əvvəlcə "Vəzifələr" bölməsindən yaradın.
            </div>
          ) : (
            <select value={d.position}
              onChange={e => setD({ ...d, position: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              <option value="">— vəzifə seçin —</option>
              {unitPositions.map((p, i) => (
                <option key={i} value={p.position_name}>{p.position_name}</option>
              ))}
            </select>
          )}
          {selectedPos?.manager_name && (
            <div className={`text-[11px] mt-1 ${theme.textFaint}`}>
              Rəhbər: <span className="text-blue-500 font-medium">{selectedPos.manager_name}</span>
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`${L.emp.salary} (AZN)`} theme={theme}>
            <input type="number" value={d.salary} onChange={e => setD({ ...d, salary: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <Field label={L.emp.hireDate} theme={theme}>
            <input type="date" value={d.start_date} onChange={e => setD({ ...d, start_date: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
          </Field>
        </div>
      </div>
      <Buttons onSave={() => onSave(d)} onCancel={onClose} disabled={!valid} L={L} theme={theme} />
    </Modal>
  );
}

function SalaryChangeModal({ L, theme, emp, onSave, onClose }) {
  const [eff, setEff] = useState(toISO(new Date()));
  const [amt, setAmt] = useState('');
  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · ${L.emp.editSalary}`}>
      <div className="space-y-3">
        <Field label={L.emp.effective} theme={theme}><input type="date" value={eff} onChange={e=>setEff(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}/></Field>
        <Field label="Yeni maaş (AZN)" theme={theme}><input type="number" value={amt} onChange={e=>setAmt(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} autoFocus/></Field>
      </div>
      <Buttons onSave={()=>onSave(eff,amt)} onCancel={onClose} disabled={!amt||!eff} L={L} theme={theme}/>
    </Modal>
  );
}

function PositionChangeModal({ L, theme, emp, onSave, onClose }) {
  const [eff, setEff] = useState(toISO(new Date()));
  const [pos, setPos] = useState('');
  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · ${L.emp.editPosition}`}>
      <div className="space-y-3">
        <Field label={L.emp.effective} theme={theme}><input type="date" value={eff} onChange={e=>setEff(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}/></Field>
        <Field label="Yeni vəzifə" theme={theme}><input value={pos} onChange={e=>setPos(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus/></Field>
      </div>
      <Buttons onSave={()=>onSave(eff,pos)} onCancel={onClose} disabled={!pos||!eff} L={L} theme={theme}/>
    </Modal>
  );
}

function TransferModal({ L, lang, theme, emp, companies, orgUnits, canEditSal, onSave, onClose }) {
  const cur = currentAssignment(emp);
  const [date, setDate] = useState(toISO(new Date()));
  const [companyId, setCompanyId] = useState(cur?.company_id || companies[0]?.id);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [changeSal, setChangeSal] = useState(false);
  const [newSal, setNewSal] = useState('');
  const filteredOus = orgUnits.filter(u => u.company_id === companyId);
  const valid = date && companyId && orgUnitId && (!changeSal || newSal);
  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · ${L.emp.transfer}`}>
      <div className="space-y-3">
        <Field label={L.emp.transferDate} theme={theme}><input type="date" value={date} onChange={e=>setDate(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}/></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L.emp.newCompany} theme={theme}>
            <select value={companyId} onChange={e=>{setCompanyId(e.target.value);setOrgUnitId('');}} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              {companies.map(c=><option key={c.id} value={c.id}>{c.name_az}</option>)}
            </select>
          </Field>
          <Field label={L.emp.newOrgUnit} theme={theme}>
            <select value={orgUnitId} onChange={e=>setOrgUnitId(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              <option value="">—</option>
              {filteredOus.map(u=><option key={u.id} value={u.id}>{L.levels[u.level]} · {u.name_az}</option>)}
            </select>
          </Field>
        </div>
        {canEditSal && (
          <>
            <label className={`flex items-center gap-2.5 p-2.5 rounded-lg ${theme.hover} cursor-pointer`}>
              <input type="checkbox" checked={changeSal} onChange={e=>setChangeSal(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
              <span className="text-sm">{L.emp.salaryChangeOptional}</span>
            </label>
            {changeSal && <Field label="Yeni maaş (AZN)" theme={theme}><input type="number" value={newSal} onChange={e=>setNewSal(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`}/></Field>}
          </>
        )}
      </div>
      <Buttons onSave={()=>onSave(date,companyId,orgUnitId,changeSal?newSal:null)} onCancel={onClose} disabled={!valid} L={L} theme={theme}/>
    </Modal>
  );
}

function TerminationModal({ L, lang, theme, emp, canOverride, onSave, onClose }) {
  const [date, setDate] = useState(toISO(new Date()));
  const [override, setOverride] = useState(false);
  const [vacation, setVacation] = useState('');
  const [compensation, setCompensation] = useState('');
  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · ${L.emp.terminate}`}>
      <Field label={L.emp.payoutDate} theme={theme}><input type="date" value={date} onChange={e=>setDate(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus/></Field>
      {canOverride && (
        <>
          <label className={`mt-3 flex items-center gap-2.5 p-2.5 rounded-lg ${theme.hover} cursor-pointer`}>
            <input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
            <span className="text-sm">{L.emp.overrideAuto}</span>
          </label>
          {override && (
            <div className="mt-3 space-y-2">
              <Field label={`${L.emp.vacation} (AZN)`} theme={theme}><input type="number" value={vacation} onChange={e=>setVacation(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`}/></Field>
              <Field label={`${L.emp.compensation} (AZN)`} theme={theme}><input type="number" value={compensation} onChange={e=>setCompensation(e.target.value)} className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`}/></Field>
            </div>
          )}
        </>
      )}
      <div className="flex gap-2 mt-5">
        <button onClick={()=>onSave(date,override?{vacation:Number(vacation),compensation:Number(compensation)}:null)}
          className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">{L.actions.confirm}</button>
        <button onClick={onClose} className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm`}>{L.actions.cancel}</button>
      </div>
    </Modal>
  );
}
