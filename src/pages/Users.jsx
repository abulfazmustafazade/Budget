import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
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
  const [editing, setEditing] = useState(null);

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

  const save = async (u) => {
    // Update profile
    await supabase.from('user_profiles')
      .update({ display_name: u.display_name, is_admin: u.is_admin })
      .eq('id', u.id);

    // Upsert permissions
    const permsPayload = { user_id: u.id };
    [...VISIBILITY_KEYS, ...PERMISSION_KEYS, ...ADMIN_ONLY_KEYS, 'all_companies', 'all_org_units']
      .forEach(k => permsPayload[k] = !!u.permissions[k]);
    await supabase.from('user_permissions').upsert(permsPayload);

    // Reset company access
    await supabase.from('user_company_access').delete().eq('user_id', u.id);
    if (u.companies?.length) {
      await supabase.from('user_company_access').insert(
        u.companies.map(cid => ({ user_id: u.id, company_id: cid }))
      );
    }

    // Reset org unit access
    await supabase.from('user_org_unit_access').delete().eq('user_id', u.id);
    if (u.org_units?.length) {
      await supabase.from('user_org_unit_access').insert(
        u.org_units.map(ouid => ({ user_id: u.id, org_unit_id: ouid }))
      );
    }

    setEditing(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={L.perm.title} subtitle={`${users.length}`} theme={theme} />

      <div className={`${theme.surface2} border ${theme.border} rounded-lg p-3 text-xs ${theme.textDim} flex items-start gap-2`}>
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <div className="font-semibold mb-0.5">User creation</div>
          <div>Create new users in Supabase Dashboard → Authentication → Users. Then they'll appear here for permission assignment after you create a profile row for them.</div>
        </div>
      </div>

      {loading ? (
        <div className={`text-sm ${theme.textDim} text-center py-10`}>Loading...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {users.map(u => {
            const p = u.permissions;
            const visibleFieldsCount = VISIBILITY_KEYS.filter(k => p[k]).length;
            const editPermsCount = PERMISSION_KEYS.filter(k => p[k]).length;
            return (
              <div key={u.id} className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate flex items-center gap-2">
                      {u.display_name}
                      {u.is_admin && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> admin
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${theme.textDim} mt-0.5 truncate`}>{u.id.slice(0, 8)}...</div>
                  </div>
                  <button onClick={() => setEditing({ ...u })} className={`p-1.5 rounded-md ${theme.hover}`}>
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <div className={`text-xs ${theme.textDim} space-y-1`}>
                  <div>
                    {L.perm.visibleCompanies}: <span className={theme.text}>
                      {p.all_companies ? L.perm.visibleAll : `${u.companies?.length || 0}`}
                    </span>
                  </div>
                  <div>
                    {L.perm.visibleOrgUnits}: <span className={theme.text}>
                      {p.all_org_units ? L.perm.visibleAll : `${u.org_units?.length || 0}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {visibleFieldsCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                        {visibleFieldsCount} {L.perm.visibility.toLowerCase()}
                      </span>
                    )}
                    {editPermsCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-semibold">
                        {editPermsCount} {L.perm.actions.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <UserEditModal L={L} theme={theme} user={editing}
          companies={companies} orgUnits={orgUnits}
          onSave={save} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

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
        {/* Identity */}
        <Field label={L.perm.displayName} theme={theme}>
          <input value={u.display_name}
            onChange={(e) => setU({ ...u, display_name: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${theme.input} text-sm`} />
        </Field>

        <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${theme.border} ${theme.hover} cursor-pointer`}>
          <input type="checkbox" checked={u.is_admin}
            onChange={(e) => setU({ ...u, is_admin: e.target.checked })}
            className="w-4 h-4 accent-blue-600" />
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-bold">{L.perm.isAdmin}</span>
        </label>

        {u.is_admin && (
          <div className={`${theme.surface2} border ${theme.border} rounded-lg p-3 text-xs ${theme.textDim} flex items-start gap-2`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>Administrators bypass all permission checks and can do everything.</span>
          </div>
        )}

        {/* VISIBILITY */}
        <div>
          <div className={`text-[11px] font-bold mb-2 ${theme.textDim} uppercase tracking-wider`}>{L.perm.visibility}</div>

          <div className="space-y-2">
            <div>
              <div className={`text-xs font-semibold mb-1.5 ${theme.textDim}`}>{L.perm.visibleCompanies}</div>
              <label className={`flex items-center gap-2.5 p-2 rounded-lg ${theme.hover} cursor-pointer`}>
                <input type="checkbox" checked={!!p.all_companies}
                  onChange={(e) => setP({ all_companies: e.target.checked })}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-semibold">{L.perm.visibleAll}</span>
              </label>
              {!p.all_companies && (
                <div className="ml-2 mt-1 space-y-0.5">
                  {companies.map(c => (
                    <label key={c.id} className={`flex items-center gap-2.5 p-2 rounded-lg ${theme.hover} cursor-pointer`}>
                      <input type="checkbox" checked={u.companies.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-sm">{c.name_az}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className={`text-xs font-semibold mb-1.5 ${theme.textDim}`}>{L.perm.visibleOrgUnits}</div>
              <label className={`flex items-center gap-2.5 p-2 rounded-lg ${theme.hover} cursor-pointer`}>
                <input type="checkbox" checked={!!p.all_org_units}
                  onChange={(e) => setP({ all_org_units: e.target.checked })}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-semibold">{L.perm.visibleAll}</span>
              </label>
              {!p.all_org_units && (
                <div className="ml-2 mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                  {visibleOus.map(o => {
                    const c = companies.find(x => x.id === o.company_id);
                    return (
                      <label key={o.id} className={`flex items-center gap-2.5 p-2 rounded-lg ${theme.hover} cursor-pointer`}>
                        <input type="checkbox" checked={u.org_units.includes(o.id)}
                          onChange={() => toggleOrgUnit(o.id)}
                          className="w-4 h-4 accent-blue-600" />
                        <span className="text-sm">{c?.name_az} · <span className={`text-[10px] uppercase tracking-wider font-bold ${theme.textDim}`}>{L.levels[o.level]}</span> {o.name_az}</span>
                      </label>
                    );
                  })}
                  {visibleOus.length === 0 && (
                    <div className={`text-xs ${theme.textFaint} p-2`}>Select companies first</div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className={`text-xs font-semibold mb-1.5 ${theme.textDim}`}>{L.perm.visibleFields}</div>
              <div className="space-y-0.5">
                {VISIBILITY_KEYS.map(k => (
                  <label key={k} className={`flex items-center justify-between p-2 rounded-lg ${theme.hover} cursor-pointer`}>
                    <span className="text-sm">{L.perm.fields[k]}</span>
                    <input type="checkbox" checked={!!p[k]}
                      onChange={(e) => setP({ [k]: e.target.checked })}
                      className="w-4 h-4 accent-blue-600" />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div>
          <div className={`text-[11px] font-bold mb-2 ${theme.textDim} uppercase tracking-wider`}>{L.perm.actions}</div>
          <div className="space-y-0.5">
            {PERMISSION_KEYS.map(k => (
              <label key={k} className={`flex items-center justify-between p-2 rounded-lg ${theme.hover} cursor-pointer`}>
                <span className="text-sm">{L.perm.perms[k]}</span>
                <input type="checkbox" checked={!!p[k]}
                  onChange={(e) => setP({ [k]: e.target.checked })}
                  className="w-4 h-4 accent-blue-600" />
              </label>
            ))}
          </div>
        </div>

        {/* ADMIN-ONLY (locked unless is_admin) */}
        <div>
          <div className={`text-[11px] font-bold mb-2 ${theme.textDim} uppercase tracking-wider`}>Admin-only</div>
          <div className="space-y-0.5">
            {ADMIN_ONLY_KEYS.map(k => (
              <label key={k} className={`flex items-center justify-between p-2 rounded-lg ${theme.hover} cursor-pointer ${!u.is_admin ? 'opacity-50' : ''}`}>
                <span className="text-sm">{L.perm.perms[k]}</span>
                <input type="checkbox" checked={!!p[k]} disabled={!u.is_admin}
                  onChange={(e) => setP({ [k]: e.target.checked })}
                  className="w-4 h-4 accent-blue-600" />
              </label>
            ))}
          </div>
        </div>
      </div>
      <Buttons onSave={() => onSave(u)} onCancel={onClose} disabled={!u.display_name} L={L} theme={theme} />
    </Modal>
  );
}
