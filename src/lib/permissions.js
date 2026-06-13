// Permission keys helper

export const PERMISSION_KEYS = [
  'can_edit_employees',
  'can_edit_salaries',
  'can_edit_positions',
  'can_transfer_employees',
  'can_terminate_employees',
  'can_override_payouts',
  'can_edit_budgets',
];

export const VISIBILITY_KEYS = [
  'see_salaries',
  'see_termination_payouts',
  'see_budgets',
  'see_savings',
];

export const ADMIN_ONLY_KEYS = ['can_manage_structure', 'can_manage_users'];

export function hasPerm(profile, perms, key) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return !!perms?.[key];
}

export function canSeeField(profile, perms, fieldKey) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return !!perms?.[fieldKey];
}

export const fmtMoney = (n, lang = 'az') =>
  new Intl.NumberFormat(lang === 'az' ? 'az-AZ' : 'en-US', { maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0));

export const toISO = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
};
