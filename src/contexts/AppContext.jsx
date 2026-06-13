import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { translations } from '../lib/i18n';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [perms, setPerms] = useState(null);
  const [companyAccess, setCompanyAccess] = useState([]);
  const [orgUnitAccess, setOrgUnitAccess] = useState([]);
  const [loading, setLoading] = useState(true);

  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'az');
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setPerms(null);
        setCompanyAccess([]);
        setOrgUnitAccess([]);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load profile + perms when session changes
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, perm, ca, oa] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('user_permissions').select('*').eq('user_id', session.user.id).single(),
        supabase.from('user_company_access').select('company_id').eq('user_id', session.user.id),
        supabase.from('user_org_unit_access').select('org_unit_id').eq('user_id', session.user.id),
      ]);
      if (cancelled) return;
      setProfile(p.data);
      setPerms(perm.data);
      setCompanyAccess(ca.data?.map(x => x.company_id) || []);
      setOrgUnitAccess(oa.data?.map(x => x.org_unit_id) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const L = translations[lang];

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AppContext.Provider value={{
      session, profile, perms, companyAccess, orgUnitAccess, loading,
      lang, setLang, dark, setDark, L, signOut,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
