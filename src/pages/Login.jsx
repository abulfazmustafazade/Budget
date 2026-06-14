import React, { useState } from 'react';
import { Sun, Moon, Globe, Wallet, Lock, User as UserIcon } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/primitives';

export default function Login() {
  const { L, lang, setLang, dark, setDark } = useApp();
  const theme = useTheme(dark);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);

    try {
      // Username-dən email tap
      const { data: emailData, error: fnError } = await supabase
        .rpc('get_email_by_username', { p_username: username.trim() });

      if (fnError || !emailData) {
        setError(L.login.wrong);
        setLoading(false);
        return;
      }

      // Email ilə daxil ol
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailData,
        password,
      });

      if (signInError) setError(L.login.wrong);
    } catch {
      setError(L.login.wrong);
    }

    setLoading(false);
  };

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} flex flex-col`}>
      <div className="flex justify-end p-4 gap-1">
        <button
          onClick={() => setLang(lang === 'en' ? 'az' : 'en')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${theme.border} ${theme.hover} flex items-center gap-1.5`}
        >
          <Globe className="w-3.5 h-3.5" /> {lang.toUpperCase()}
        </button>
        <button onClick={() => setDark(!dark)} className={`p-2 rounded-lg ${theme.hover}`}>
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 -mt-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 justify-center mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <div className="font-bold text-lg leading-tight">{L.login.subtitle}</div>
              <div className={`text-xs ${theme.textDim}`}>{L.tagline}</div>
            </div>
          </div>

          <div className={`${theme.surface} border ${theme.border} rounded-2xl p-6 shadow-sm`}>
            <h1 className="font-semibold text-base mb-5">{L.login.title}</h1>
            <div className="space-y-3">
              <div>
                <label className={`block text-[11px] font-semibold mb-1.5 ${theme.textDim} uppercase tracking-wider`}>
                  {L.login.username}
                </label>
                <div className="relative">
                  <UserIcon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textFaint}`} />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg border ${theme.input} text-sm`}
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                  />
                </div>
              </div>
              <div>
                <label className={`block text-[11px] font-semibold mb-1.5 ${theme.textDim} uppercase tracking-wider`}>
                  {L.login.password}
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textFaint}`} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg border ${theme.input} text-sm`}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {error && <div className="text-xs text-rose-500">{error}</div>}
              <button
                onClick={submit}
                disabled={loading || !username || !password}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 disabled:opacity-50 text-white text-sm font-bold"
              >
                {loading ? '...' : L.login.signIn}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
