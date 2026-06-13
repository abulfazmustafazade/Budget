import React, { useState } from 'react';
import { useApp } from './contexts/AppContext';
import { useTheme } from './components/primitives';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import Organization from './pages/Organization';
import Employees from './pages/Employees';
import Users from './pages/Users';

export default function App() {
  const { session, profile, loading, dark, L } = useApp();
  const [view, setView] = useState('dashboard');
  const theme = useTheme(dark);

  // Loading state on first paint
  if (loading) {
    return (
      <div className={`min-h-screen ${theme.bg} ${theme.text} flex items-center justify-center`}>
        <div className={`text-sm ${theme.textDim}`}>Loading...</div>
      </div>
    );
  }

  // Not logged in
  if (!session) return <Login />;

  // Logged in but no profile yet (admin needs to create one)
  if (!profile) {
    return (
      <div className={`min-h-screen ${theme.bg} ${theme.text} flex items-center justify-center p-6`}>
        <div className={`${theme.surface} border ${theme.border} rounded-xl p-6 max-w-sm text-center`}>
          <div className="font-bold mb-2">{L.login.missingProfile}</div>
          <div className={`text-xs ${theme.textDim}`}>Email: {session.user.email}</div>
        </div>
      </div>
    );
  }

  return (
    <Shell view={view} setView={setView}>
      {view === 'dashboard' && <Dashboard />}
      {view === 'companies' && <Companies />}
      {view === 'organization' && <Organization />}
      {view === 'employees' && <Employees />}
      {view === 'users' && profile.is_admin && <Users />}
    </Shell>
  );
}
