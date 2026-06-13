import React, { useState, useMemo } from 'react';
import {
  Plus, TrendingUp, ArrowRightLeft, UserMinus, Check, Briefcase
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits, useEmployees } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, FilterChip, Modal, Field, Buttons } from '../components/primitives';
import { fmtMoney, canSeeField, hasPerm, toISO } from '../lib/permissions';

const YEAR = new Date().getFullYear();

// Helpers
const parseDate = (s) => (s instanceof Date ? s : new Date(s));

function salaryOn(emp, date) {
  const d = parseDate(date);
  const sorted = [...(emp.salary_history || [])].sort((a, b) => parseDate(a.effective_date) - parseDate(b.effective_date));
  let active = sorted[0]?.amount ?? 0;
  for (const c of sorted) if (parseDate(c.effective_date) <= d) active = c.amount;
  return active;
}

function positionOn(emp, date) {
  const d = parseDate(date);
  const sorted = [...(emp.position_history || [])].sort((a, b) => parseDate(a.effective_date) - parseDate(b.effective_date));
  let active = sorted[0]?.position ?? '';
  for (const p of sorted) if (parseDate(p.effective_date) <= d) active = p.position;
  return active;
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

  const canEdit = hasPerm(profile, perms, 'can_edit_employees');
  const canEditSalary = hasPerm(profile, perms, 'can_edit_salaries');
  const canEditPosition = hasPerm(profile, perms, 'can_edit_positions');
  const canTransfer = hasPerm(profile, perms, 'can_transfer_employees');
  const canTerminate = hasPerm(profile, perms, 'can_terminate_employees');
  const showSalaries = canSeeField(profile, perms, 'see_salaries');
  const showPayouts = canSeeField(profile, perms, 'see_termination_payouts');

  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (orgFilter === 'all') return true;
      const cur = currentAssignment(e);
      return cur?.org_unit_id === orgFilter;
    }).sort((a, b) => (a.end_date ? 1 : -1) - (b.end_date ? 1 : -1));
  }, [employees, orgFilter]);

  const addEmployee = async (d) => {
    const { data: emp, error } = await supabase.from('employees').insert({
      full_name: d.full_name, hire_date: d.start_date,
    }).select().single();
    if (error) { alert(error.message); return; }
    await Promise.all([
      supabase.from('assignments').insert({
        employee_id: emp.id, company_id: d.company_id, org_unit_id: d.org_unit_id,
        from_date: d.start_date,
      }),
      supabase.from('salary_history').insert({
        employee_id: emp.id, effective_date: d.start_date, amount: d.salary,
      }),
      supabase.from('position_history').insert({
        employee_id: emp.id, effective_date: d.start_date, position: d.position,
      }),
    ]);
    setAddOpen(false);
    refresh();
  };

  const changeSalary = async (emp, eff, amt) => {
    const { error } = await supabase.from('salary_history').insert({
      employee_id: emp.id, effective_date: eff, amount: Number(amt),
    });
    if (error) alert(error.message);
    setSalaryDlg(null);
    refresh();
  };

  const changePosition = async (emp, eff, pos) => {
    const { error } = await supabase.from('position_history').insert({
      employee_id: emp.id, effective_date: eff, position: pos,
    });
    if (error) alert(error.message);
    setPositionDlg(null);
    refresh();
  };

  const transfer = async (emp, date, compId, ouId, newSalary) => {
    const { error } = await supabase.rpc('transfer_employee', {
      p_employee_id: emp.id, p_new_company_id: compId,
      p_new_org_unit_id: ouId, p_transfer_date: date,
      p_new_salary: newSalary ? Number(newSalary) : null,
    });
    if (error) alert(error.message);
    setTransferDlg(null);
    refresh();
  };

  const terminate = async (emp, endDate, override) => {
    const { error } = await supabase.from('employees').update({
      end_date: endDate,
      termination_vacation_override: override?.vacation ?? null,
      termination_compensation_override: override?.compensation ?? null,
    }).eq('id', emp.id);
    if (error) alert(error.message);
    setTermDlg(null);
    refresh();
  };

  const reactivate = async (emp) => {
    await supabase.from('employees').update({
      end_date: null,
      termination_vacation_override: null,
      termination_compensation_override: null,
    }).eq('id', emp.id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.emp.title}
        subtitle={`${filtered.length}`}
        theme={theme}
        action={canEdit && orgUnits.length > 0 && (
          <button onClick={() => setAddOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5">
            <Plus className="w-4 h-4" />{L.emp.add}
          </button>
        )}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <FilterChip active={orgFilter === 'all'} onClick={() => setOrgFilter('all')} theme={theme}>
          {L.common.all}
        </FilterChip>
        {orgUnits.map(u => {
          const c = companies.find(x => x.id === u.company_id);
          return (
            <FilterChip key={u.id} active={orgFilter === u.id} onClick={() => setOrgFilter(u.id)} theme={theme}>
              {c?.name_az} · {u.name_az}
            </FilterChip>
          );
        })}
      </div>

      <div className={`${theme.surface} border ${theme.border} rounded-xl overflow-hidden`}>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filtered.map(emp => {
            const cur = currentAssignment(emp);
            const curOu = orgUnits.find(u => u.id === cur?.org_unit_id);
            const curCo = companies.find(c => c.id === cur?.company_id);
            const currentSalary = salaryOn(emp, emp.end_date || new Date());
            const currentPosition = positionOn(emp, emp.end_date || new Date());

            return (
              <div key={emp.id} className={`p-4 ${theme.hover}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                    emp.end_date ? 'from-slate-400 to-slate-500' : 'from-blue-500 to-emerald-500'
                  } flex items-center justify-center text-white text-sm font-bold shrink-0`}>
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
                          {(emp.assignments?.length || 0) > 1 && (
                            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                              ×{emp.assignments.length - 1} {L.emp.transfer.toLowerCase()}
                            </span>
                          )}
                        </div>
                        <div className={`text-xs ${theme.textDim} truncate`}>
                          {currentPosition} · {curCo?.name_az} / {curOu?.name_az}
                        </div>
                      </div>
                      {showSalaries && (
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular-nums">{fmtMoney(currentSalary, lang)}</div>
                          <div className={`text-[11px] ${theme.textDim}`}>{L.currency}/mo</div>
                        </div>
                      )}
                    </div>

                    {(canEdit || canEditSalary || canEditPosition || canTransfer || canTerminate) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {!emp.end_date ? (
                          <>
                            {canEditSalary && (
                              <ActionBtn onClick={() => setSalaryDlg(emp)} theme={theme} icon={TrendingUp}>
                                {L.emp.editSalary}
                              </ActionBtn>
                            )}
                            {canEditPosition && (
                              <ActionBtn onClick={() => setPositionDlg(emp)} theme={theme} icon={Briefcase}>
                                {L.emp.editPosition}
                              </ActionBtn>
                            )}
                            {canTransfer && (
                              <ActionBtn onClick={() => setTransferDlg(emp)} theme={theme} icon={ArrowRightLeft}>
                                {L.emp.transfer}
                              </ActionBtn>
                            )}
                            {canTerminate && (
                              <ActionBtn onClick={() => setTermDlg(emp)} theme={theme} icon={UserMinus} variant="danger">
                                {L.emp.terminate}
                              </ActionBtn>
                            )}
                          </>
                        ) : (canTerminate && (
                          <ActionBtn onClick={() => reactivate(emp)} theme={theme} icon={Check}>
                            {L.emp.reactivate}
                          </ActionBtn>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className={`p-10 text-center ${theme.textDim} text-sm`}>{L.empty}</div>}
        </div>
      </div>

      {addOpen && (
        <AddEmployeeModal L={L} theme={theme} lang={lang} companies={companies} orgUnits={orgUnits}
          onSave={addEmployee} onClose={() => setAddOpen(false)} />
      )}
      {salaryDlg && (
        <SalaryChangeModal L={L} theme={theme} emp={salaryDlg}
          onSave={(eff, amt) => changeSalary(salaryDlg, eff, amt)} onClose={() => setSalaryDlg(null)} />
      )}
      {positionDlg && (
        <PositionChangeModal L={L} theme={theme} emp={positionDlg}
          onSave={(eff, pos) => changePosition(positionDlg, eff, pos)} onClose={() => setPositionDlg(null)} />
      )}
      {transferDlg && (
        <TransferModal L={L} lang={lang} theme={theme} emp={transferDlg}
          companies={companies} orgUnits={orgUnits} canEditSalary={canEditSalary}
          onSave={(d, c, ou, s) => transfer(transferDlg, d, c, ou, s)} onClose={() => setTransferDlg(null)} />
      )}
      {termDlg && (
        <TerminationModal L={L} lang={lang} theme={theme} emp={termDlg}
          canOverride={hasPerm(profile, perms, 'can_override_payouts')}
          onSave={(d, override) => terminate(termDlg, d, override)} onClose={() => setTermDlg(null)} />
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, icon: Icon, variant, theme }) {
  const styles = variant === 'danger'
    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
    : `${theme.textDim} ${theme.hover}`;
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border ${theme.border} ${styles} flex items-center gap-1.5`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}{children}
    </button>
  );
}

function AddEmployeeModal({ L, theme, lang, companies, orgUnits, onSave, onClose }) {
  const [d, setD] = useState({
    full_name: '', position: '',
    company_id: companies[0]?.id || '',
    org_unit_id: '',
    salary: '', start_date: toISO(new Date()),
  });
  const filteredOus = orgUnits.filter(u => u.company_id === d.company_id);
  const valid = d.full_name && d.position && d.salary && d.start_date && d.org_unit_id;
  return (
    <Modal onClose={onClose} theme={theme} title={L.emp.add}>
      <div className="space-y-3">
        <Field label={L.emp.name} theme={theme}>
          <input value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>
        <Field label={L.emp.position} theme={theme}>
          <input value={d.position} onChange={(e) => setD({ ...d, position: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L.emp.company} theme={theme}>
            <select value={d.company_id}
              onChange={(e) => setD({ ...d, company_id: e.target.value, org_unit_id: '' })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name_az}</option>)}
            </select>
          </Field>
          <Field label={L.emp.orgUnit} theme={theme}>
            <select value={d.org_unit_id} onChange={(e) => setD({ ...d, org_unit_id: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              <option value="">—</option>
              {filteredOus.map(u => <option key={u.id} value={u.id}>{L.levels[u.level]} · {u.name_az}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${L.emp.salary} (${L.currency})`} theme={theme}>
            <input type="number" value={d.salary} onChange={(e) => setD({ ...d, salary: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
          </Field>
          <Field label={L.emp.hireDate} theme={theme}>
            <input type="date" value={d.start_date} onChange={(e) => setD({ ...d, start_date: e.target.value })}
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
        <Field label={L.emp.effective} theme={theme}>
          <input type="date" value={eff} onChange={(e) => setEff(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>
        <Field label={`${L.emp.newSalary} (${L.currency})`} theme={theme}>
          <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} autoFocus />
        </Field>
      </div>
      <Buttons onSave={() => onSave(eff, amt)} onCancel={onClose} disabled={!amt || !eff} L={L} theme={theme} />
    </Modal>
  );
}

function PositionChangeModal({ L, theme, emp, onSave, onClose }) {
  const [eff, setEff] = useState(toISO(new Date()));
  const [pos, setPos] = useState('');
  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · ${L.emp.editPosition}`}>
      <div className="space-y-3">
        <Field label={L.emp.effective} theme={theme}>
          <input type="date" value={eff} onChange={(e) => setEff(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>
        <Field label={L.emp.newPosition} theme={theme}>
          <input value={pos} onChange={(e) => setPos(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
        </Field>
      </div>
      <Buttons onSave={() => onSave(eff, pos)} onCancel={onClose} disabled={!pos || !eff} L={L} theme={theme} />
    </Modal>
  );
}

function TransferModal({ L, lang, theme, emp, companies, orgUnits, canEditSalary, onSave, onClose }) {
  const cur = currentAssignment(emp);
  const [date, setDate] = useState(toISO(new Date()));
  const [companyId, setCompanyId] = useState(cur?.company_id || companies[0]?.id);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [changeSalary, setChangeSalary] = useState(false);
  const [newSalary, setNewSalary] = useState('');
  const filteredOus = orgUnits.filter(u => u.company_id === companyId);
  const valid = date && companyId && orgUnitId && (!changeSalary || newSalary);

  return (
    <Modal onClose={onClose} theme={theme} title={`${emp.full_name} · ${L.emp.transfer}`}>
      <div className="space-y-3">
        <Field label={L.emp.transferDate} theme={theme}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L.emp.newCompany} theme={theme}>
            <select value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setOrgUnitId(''); }}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name_az}</option>)}
            </select>
          </Field>
          <Field label={L.emp.newOrgUnit} theme={theme}>
            <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}>
              <option value="">—</option>
              {filteredOus.map(u => <option key={u.id} value={u.id}>{L.levels[u.level]} · {u.name_az}</option>)}
            </select>
          </Field>
        </div>
        {canEditSalary && (
          <>
            <label className={`flex items-center gap-2.5 p-2.5 rounded-lg ${theme.hover} cursor-pointer`}>
              <input type="checkbox" checked={changeSalary} onChange={(e) => setChangeSalary(e.target.checked)}
                className="w-4 h-4 accent-blue-600" />
              <span className="text-sm">{L.emp.salaryChangeOptional}</span>
            </label>
            {changeSalary && (
              <Field label={`${L.emp.newSalary} (${L.currency})`} theme={theme}>
                <input type="number" value={newSalary} onChange={(e) => setNewSalary(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
              </Field>
            )}
          </>
        )}
      </div>
      <Buttons onSave={() => onSave(date, companyId, orgUnitId, changeSalary ? newSalary : null)}
        onCancel={onClose} disabled={!valid} L={L} theme={theme} />
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
      <Field label={L.emp.payoutDate} theme={theme}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} autoFocus />
      </Field>
      {canOverride && (
        <>
          <label className={`mt-3 flex items-center gap-2.5 p-2.5 rounded-lg ${theme.hover} cursor-pointer`}>
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{L.emp.overrideAuto}</span>
          </label>
          {override && (
            <div className="mt-3 space-y-2">
              <Field label={`${L.emp.vacation} (${L.currency})`} theme={theme}>
                <input type="number" value={vacation} onChange={(e) => setVacation(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
              </Field>
              <Field label={`${L.emp.compensation} (${L.currency})`} theme={theme}>
                <input type="number" value={compensation} onChange={(e) => setCompensation(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm tabular-nums`} />
              </Field>
            </div>
          )}
        </>
      )}
      <div className="flex gap-2 mt-5">
        <button onClick={() => onSave(date, override ? { vacation: Number(vacation), compensation: Number(compensation) } : null)}
          className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">
          {L.actions.confirm}
        </button>
        <button onClick={onClose}
          className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}>
          {L.actions.cancel}
        </button>
      </div>
    </Modal>
  );
}
