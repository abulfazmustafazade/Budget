import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, ShieldCheck, AlertTriangle, Plus, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCompanies, useOrgUnits } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { PageHeader, useTheme, Modal, Field, Buttons } from '../components/primitives';
import { PERMISSION_KEYS, VISIBILITY_KEYS, ADMIN_ONLY_KEYS } from '../lib/permissions';

export default function Users() {
  const { L, dark, profile } = useApp();
  const theme = useTheme(dark);
  const { data: companies } = useCompanies();
  const { data: orgUnits } = useOrgUnits();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);      // mövcud useri redaktə
  const [adding, setAdding] = useState(false);        // yeni user modal
  const [pwdDlg, setPwdDlg] = useState(null);        // parol dəyişmə modal
  const [delDlg, setDelDlg] = useState(null);        // silmə təsdiq modal
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('user_profiles').select('*').order('display_name');
    const { data: allPerms } = await supabase.from('user_permissions').select('*');
    const { data: compAcc } = await supabase.from('user_company_access').select('*');
    const { data: ouAcc } = await supabase.from('user_org_unit_access').select('*');

    const merged = (profiles || []).map(p => ({
      ...p,
      permissions: (allPerms || []).find(x => x.user_id === p.id) || {},
      companies: (compAcc || []).filter(x => x.user_id === p.id).map(x => x.company_id),
      org_units: (ouAcc || []).filter(x => x.user_id === p.id).map(x => x.org_unit_id),
    }));
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // ── Yeni user yarat ──────────────────────────────────────────────
  const createUser = async ({ email, password, display_name, is_admin, username }) => {
    setError(null);
    const { data, error } = await supabase.rpc('create_app_user', {
      p_email: email,
      p_password: password,
      p_display_name: display_name,
      p_is_admin: is_admin,
      p_username: username,
    });
    if (error) { setError(error.message); return false; }
    setAdding(false);
    refresh();
    return true;
  };

  // ── Mövcud useri yadda saxla (icazələr) ─────────────────────────
  const save = async (u) => {
    setError(null);
    await supabase.from('user_profiles')
      .update({ display_name: u.display_name, is_admin: u.is_admin })
      .eq('id', u.id);

    const permsPayload = { user_id: u.id };
    [...VISIBILITY_KEYS, ...PERMISSION_KEYS, ...ADMIN_ONLY_KEYS, 'all_companies', 'all_org_units']
      .forEach(k => permsPayload[k] = !!u.permissions[k]);
    await supabase.from('user_permissions').upsert(permsPayload);

    await supabase.from('user_company_access').delete().eq('user_id', u.id);
    if (u.companies?.length) {
      await supabase.from('user_company_access').insert(
        u.companies.map(cid => ({ user_id: u.id, company_id: cid }))
      );
    }

    await supabase.from('user_org_unit_access').delete().eq('user_id', u.id);
    if (u.org_units?.length) {
      await supabase.from('user_org_unit_access').insert(
        u.org_units.map(ouid => ({ user_id: u.id, org_unit_id: ouid }))
      );
    }

    setEditing(null);
    refresh();
  };

  // ── Parol dəyiş ─────────────────────────────────────────────────
  const changePassword = async (userId, newPassword) => {
    setError(null);
    const { error } = await supabase.rpc('change_user_password', {
      p_user_id: userId,
      p_new_password: newPassword,
    });
    if (error) { setError(error.message); return false; }
    setPwdDlg(null);
    return true;
  };

  // ── User sil ────────────────────────────────────────────────────
  const deleteUser = async (userId) => {
    setError(null);
    const { error } = await supabase.rpc('delete_app_user', { p_user_id: userId });
    if (error) { setError(error.message); return; }
    setDelDlg(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.perm.title}
        subtitle={`${users.length}`}
        theme={theme}
        action={
          <button
            onClick={() => { setError(null); setAdding(true); }}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />{L.perm.newUser}
          </button>
        }
      />

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className={`text-sm ${theme.textDim} text-center py-10`}>Yüklənir...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {users.map(u => {
            const p = u.permissions;
            const visCount = VISIBILITY_KEYS.filter(k => p[k]).length;
            const actCount = PERMISSION_KEYS.filter(k => p[k]).length;
            const isSelf = u.id === profile?.id;
            return (
              <div key={u.id} className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate flex items-center gap-2 flex-wrap">
                      {u.display_name}
                      {u.is_admin && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> admin
                        </span>
                      )}
                      {isSelf && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          sən
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${theme.textDim} mt-0.5`}>
                      {u.username ? `@${u.username}` : `···${u.id.slice(-8)}`}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setError(null); setEditing({ ...u }); }}
                      className={`p-1.5 rounded-md ${theme.hover}`}
                      title="İcazələri redaktə et"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setError(null); setPwdDlg(u); }}
                      className={`p-1.5 rounded-md ${theme.hover}`}
                      title="Parolu dəyiş"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => { setError(null); setDelDlg(u); }}
                        className={`p-1.5 rounded-md ${theme.hover} text-rose-500`}
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className={`text-xs ${theme.textDim} space-y-1`}>
                  <div>
                    {L.perm.visibleCompanies}:{' '}
                    <span className={theme.text}>
                      {p.all_companies ? L.perm.visibleAll : `${u.companies?.length || 0}`}
                    </span>
                  </div>
                  <div>
                    {L.perm.visibleOrgUnits}:{' '}
                    <span className={theme.text}>
                      {p.all_org_units ? L.perm.visibleAll : `${u.org_units?.length || 0}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {visCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                        {visCount} görmə
                      </span>
                    )}
                    {actCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-semibold">
                        {actCount} əməliyyat
                      </span>
                    )}
                    {visCount === 0 && actCount === 0 && !u.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 font-semibold">
                        icazə yoxdur
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Yeni user əlavə et */}
      {adding && (
        <AddUserModal
          L={L} theme={theme}
          onSave={createUser}
          onClose={() => setAdding(false)}
        />
      )}

      {/* İcazə redaktəsi */}
      {editing && (
        <UserEditModal
          L={L} theme={theme} user={editing}
          companies={companies} orgUnits={orgUnits}
          onSave={save} onClose={() => setEditing(null)}
        />
      )}

      {/* Parol dəyişmə */}
      {pwdDlg && (
        <PasswordModal
          L={L} theme={theme} user={pwdDlg}
          onSave={(pwd) => changePassword(pwdDlg.id, pwd)}
          onClose={() => setPwdDlg(null)}
        />
      )}

      {/* Silmə təsdiqi */}
      {delDlg && (
        <Modal onClose={() => setDelDlg(null)} theme={theme} title="İstifadəçini sil?">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <div className="font-semibold text-sm">{delDlg.display_name}</div>
              <div className={`text-xs ${theme.textDim} mt-1`}>
                Bu istifadəçi silinəcək. Əməliyyat geri qaytarıla bilməz.
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => deleteUser(delDlg.id)}
              className="flex-1 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
            >
              Sil
            </button>
            <button
              onClick={() => setDelDlg(null)}
              className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}
            >
              {L.actions.cancel}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Yeni user əlavə etmə modal ──────────────────────────────────────────────
function AddUserModal({ L, theme, onSave, onClose }) {
  const [form, setForm] = useState({
    display_name: '',
    username: '',
    email: '',
    password: '',
    is_admin: false,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const valid = form.display_name && form.username && form.email && form.password.length >= 6;

  const submit = async () => {
    setLocalError(null);
    setLoading(true);
    const ok = await onSave(form);
    setLoading(false);
    if (!ok) setLocalError('Xəta baş verdi. E-poçt artıq mövcud ola bilər.');
  };

  return (
    <Modal onClose={onClose} theme={theme} title={L.perm.newUser}>
      <div className="space-y-3">
        <Field label={L.perm.displayName} theme={theme}>
          <input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Məs: Aytən Məmmədova"
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
            autoFocus
          />
        </Field>

        <Field label="İstifadəçi adı" theme={theme}>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
            placeholder="Məs: ayten"
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <div className={`text-[11px] mt-1 ${theme.textFaint}`}>Daxil olmaq üçün bu ad istifadə olunur</div>
        </Field>

        <Field label={L.perm.email} theme={theme}>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="ayten@company.az"
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
          />
        </Field>

        <Field label={L.perm.password} theme={theme}>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimum 6 simvol"
              className={`w-full px-3 py-2 pr-9 rounded-lg border ${theme.input} text-sm`}
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded`}
            >
              {showPwd
                ? <EyeOff className="w-4 h-4 text-slate-400" />
                : <Eye className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
          {form.password && form.password.length < 6 && (
            <div className="text-[11px] text-amber-500 mt-1">Ən azı 6 simvol</div>
          )}
        </Field>

        <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${theme.border} cursor-pointer hover:bg-blue-500/5`}>
          <input
            type="checkbox"
            checked={form.is_admin}
            onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <div>
            <div className="text-sm font-bold">{L.perm.isAdmin}</div>
            <div className={`text-[11px] ${theme.textDim}`}>Bütün icazələr avtomatik verilir</div>
          </div>
        </label>

        {localError && (
          <div className="text-xs text-rose-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {localError}
          </div>
        )}
      </div>

      <Buttons
        onSave={submit}
        onCancel={onClose}
        disabled={!valid || loading}
        saveLabel={loading ? 'Yaradılır...' : L.actions.save}
        L={L}
        theme={theme}
      />
    </Modal>
  );
}

// ─── Parol dəyişmə modal ─────────────────────────────────────────────────────
function PasswordModal({ L, theme, user, onSave, onClose }) {
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setLocalError(null);
    setLoading(true);
    const ok = await onSave(pwd);
    setLoading(false);
    if (ok) setDone(true);
    else setLocalError('Xəta baş verdi.');
  };

  return (
    <Modal onClose={onClose} theme={theme} title={`${user.display_name} · Parol dəyiş`}>
      {done ? (
        <div className="py-4 text-center">
          <div className="text-emerald-500 font-bold mb-1">✓ Parol dəyişdirildi</div>
          <button onClick={onClose} className={`mt-3 px-4 py-2 rounded-lg border ${theme.border} text-sm`}>
            Bağla
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <Field label="Yeni parol" theme={theme}>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Minimum 6 simvol"
                  className={`w-full px-3 py-2 pr-9 rounded-lg border ${theme.input} text-sm`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded"
                >
                  {showPwd
                    ? <EyeOff className="w-4 h-4 text-slate-400" />
                    : <Eye className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
            </Field>
            {localError && (
              <div className="text-xs text-rose-500">{localError}</div>
            )}
          </div>
          <Buttons
            onSave={submit}
            onCancel={onClose}
            disabled={pwd.length < 6 || loading}
            saveLabel={loading ? '...' : 'Dəyiş'}
            L={L}
            theme={theme}
          />
        </>
      )}
    </Modal>
  );
}

// ─── İcazə redaktəsi modal ───────────────────────────────────────────────────
function UserEditModal({ L, theme, user, companies, orgUnits, onSave, onClose }) {
  const [u, setU] = useState({
    ...user,
    permissions: user.permissions || {},
    companies: user.companies || [],
    org_units: user.org_units || [],
  });
  const p = u.permissions;
  const setP = (patch) => setU({ ...u, permissions: { ...p, ...patch } });

  const toggleCompany = (id) => {
    const has = u.companies.includes(id);
    setU({ ...u, companies: has ? u.companies.filter(x => x !== id) : [...u.companies, id] });
  };
  const toggleOrgUnit = (id) => {
    const has = u.org_units.includes(id);
    setU({ ...u, org_units: has ? u.org_units.filter(x => x !== id) : [...u.org_units, id] });
  };

  const visibleOus = p.all_companies
    ? orgUnits
    : orgUnits.filter(o => u.companies.includes(o.company_id));

  return (
    <Modal onClose={onClose} theme={theme} title={u.display_name} wide>
      <div className="space-y-5">

        {/* Ad */}
        <Field label={L.perm.displayName} theme={theme}>
          <input
            value={u.display_name}
            onChange={(e) => setU({ ...u, display_name: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`}
          />
        </Field>

        {/* Admin */}
        <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${theme.border} cursor-pointer hover:bg-blue-500/5`}>
          <input type="checkbox" checked={u.is_admin}
            onChange={(e) => setU({ ...u, is_admin: e.target.checked })}
            className="w-4 h-4 accent-blue-600" />
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-bold">{L.perm.isAdmin}</span>
        </label>

        {u.is_admin && (
          <div className={`${theme.surface2} border ${theme.border} rounded-lg p-3 text-xs ${theme.textDim} flex gap-2`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>Administrator bütün icazə yoxlamalarını keçir.</span>
          </div>
        )}

        {/* GÖRMƏ İCAZƏLƏRİ */}
        <Section title={L.perm.visibility} theme={theme}>

          <SubSection label={L.perm.visibleCompanies} theme={theme}>
            <CheckRow checked={!!p.all_companies} onChange={(v) => setP({ all_companies: v })} theme={theme}>
              <span className="font-bold">{L.perm.visibleAll}</span>
            </CheckRow>
            {!p.all_companies && companies.map(c => (
              <CheckRow key={c.id} checked={u.companies.includes(c.id)} onChange={() => toggleCompany(c.id)} theme={theme} indent>
                {c.name_az}
              </CheckRow>
            ))}
          </SubSection>

          <SubSection label={L.perm.visibleOrgUnits} theme={theme}>
            <CheckRow checked={!!p.all_org_units} onChange={(v) => setP({ all_org_units: v })} theme={theme}>
              <span className="font-bold">{L.perm.visibleAll}</span>
            </CheckRow>
            {!p.all_org_units && (
              <div className="max-h-36 overflow-y-auto">
                {visibleOus.length === 0
                  ? <div className={`text-xs ${theme.textFaint} px-2 py-1`}>Əvvəlcə şirkət seçin</div>
                  : visibleOus.map(o => {
                      const c = companies.find(x => x.id === o.company_id);
                      return (
                        <CheckRow key={o.id} checked={u.org_units.includes(o.id)} onChange={() => toggleOrgUnit(o.id)} theme={theme} indent>
                          <span className={`text-[10px] uppercase font-bold tracking-wide ${theme.textDim}`}>{L.levels[o.level]}</span>
                          {' '}{o.name_az}
                          <span className={`${theme.textFaint} ml-1`}>· {c?.name_az}</span>
                        </CheckRow>
                      );
                    })}
              </div>
            )}
          </SubSection>

          <SubSection label={L.perm.visibleFields} theme={theme}>
            {VISIBILITY_KEYS.map(k => (
              <CheckRow key={k} checked={!!p[k]} onChange={(v) => setP({ [k]: v })} theme={theme} right>
                {L.perm.fields[k]}
              </CheckRow>
            ))}
          </SubSection>
        </Section>

        {/* ƏMƏLİYYAT İCAZƏLƏRİ */}
        <Section title={L.perm.actions} theme={theme}>
          {PERMISSION_KEYS.map(k => (
            <CheckRow key={k} checked={!!p[k]} onChange={(v) => setP({ [k]: v })} theme={theme} right>
              {L.perm.perms[k]}
            </CheckRow>
          ))}
        </Section>

        {/* ADMIN-ONLY */}
        <Section title="Admin-only" theme={theme}>
          {ADMIN_ONLY_KEYS.map(k => (
            <CheckRow key={k} checked={!!p[k]} onChange={(v) => setP({ [k]: v })}
              theme={theme} right disabled={!u.is_admin}>
              {L.perm.perms[k]}
            </CheckRow>
          ))}
        </Section>

      </div>
      <Buttons onSave={() => onSave(u)} onCancel={onClose} disabled={!u.display_name} L={L} theme={theme} />
    </Modal>
  );
}

// ─── Kiçik köməkçi komponentlər ──────────────────────────────────────────────
function Section({ title, children, theme }) {
  return (
    <div>
      <div className={`text-[11px] font-bold mb-2 ${theme.textDim} uppercase tracking-wider border-b ${theme.border} pb-1`}>
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SubSection({ label, children, theme }) {
  return (
    <div className="mb-3">
      <div className={`text-xs font-semibold mb-1 ${theme.textDim}`}>{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CheckRow({ checked, onChange, children, theme, indent, right, disabled }) {
  return (
    <label className={`flex items-center ${right ? 'justify-between' : 'gap-2.5'} p-2 rounded-lg cursor-pointer
      ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-500/5'}
      ${indent ? 'ml-4' : ''}`}>
      {!right && (
        <input type="checkbox" checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-blue-600 shrink-0" />
      )}
      <span className="text-sm">{children}</span>
      {right && (
        <input type="checkbox" checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-blue-600 shrink-0" />
      )}
    </label>
  );
}
