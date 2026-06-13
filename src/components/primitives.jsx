import React from 'react';
import { X } from 'lucide-react';

export const useTheme = (dark) => dark ? {
  bg: 'bg-slate-950', surface: 'bg-slate-900', surface2: 'bg-slate-800/60',
  text: 'text-slate-100', textDim: 'text-slate-400', textFaint: 'text-slate-500',
  border: 'border-slate-800',
  input: 'bg-slate-900 border-slate-700 text-slate-100',
  hover: 'hover:bg-slate-800/60',
  activeNav: 'bg-blue-500/10 text-blue-300 border-blue-500/40',
} : {
  bg: 'bg-slate-50', surface: 'bg-white', surface2: 'bg-slate-50',
  text: 'text-slate-900', textDim: 'text-slate-600', textFaint: 'text-slate-400',
  border: 'border-slate-200',
  input: 'bg-white border-slate-300 text-slate-900',
  hover: 'hover:bg-slate-100',
  activeNav: 'bg-blue-50 text-blue-700 border-blue-200',
};

export function Field({ label, children, theme }) {
  return (
    <div>
      <label className={`block text-[11px] font-semibold mb-1 ${theme.textDim} uppercase tracking-wider`}>{label}</label>
      {children}
    </div>
  );
}

export function Buttons({ onSave, onCancel, disabled, L, theme, saveLabel, danger }) {
  return (
    <div className="flex gap-2 mt-5">
      <button
        disabled={disabled}
        onClick={onSave}
        className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed
          ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        {saveLabel || L.actions.save}
      </button>
      <button
        onClick={onCancel}
        className={`px-4 py-2 rounded-lg border ${theme.border} ${theme.hover} text-sm font-medium`}
      >
        {L.actions.cancel}
      </button>
    </div>
  );
}

export function Modal({ children, onClose, theme, title, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`${theme.surface} border ${theme.border} rounded-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} shadow-xl max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${theme.border}`}>
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className={`p-1 rounded ${theme.hover}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function FilterChip({ active, onClick, children, theme }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
        active ? 'bg-blue-600 border-blue-600 text-white' : `${theme.border} ${theme.textDim} ${theme.hover}`
      }`}
    >
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, theme, action }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <div className={`text-sm ${theme.textDim} mt-0.5`}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, accent = 'slate', trend, theme }) {
  const accentMap = {
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    slate: theme.text,
  };
  return (
    <div className={`${theme.surface} border ${theme.border} rounded-xl p-4`}>
      <div className={`text-[11px] uppercase tracking-wider font-semibold ${theme.textDim}`}>{label}</div>
      <div className={`mt-1.5 text-xl lg:text-2xl font-bold tabular-nums ${accentMap[accent]}`}>
        {value}
      </div>
    </div>
  );
}
