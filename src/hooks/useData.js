import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const YEAR = new Date().getFullYear();

export function useCompanies() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await supabase.from('companies').select('*').order('name_en');
    setData(rows || []);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

export function useOrgUnits(companyId = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('org_units').select('*').order('level').order('name_en');
    if (companyId) q = q.eq('company_id', companyId);
    const { data: rows } = await q;
    setData(rows || []);
    setLoading(false);
  }, [companyId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

export function useEmployees() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: emps } = await supabase
      .from('employees')
      .select(`
        *,
        assignments(*),
        salary_history(*),
        position_history(*)
      `)
      .order('full_name');
    setData(emps || []);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

// Cost RPCs
export async function fetchEmployeeCosts(employeeId, year = YEAR) {
  const { data, error } = await supabase.rpc('compute_employee_costs', {
    p_employee_id: employeeId, p_year: year,
  });
  if (error) console.error(error);
  return data?.[0] || null;
}

export async function fetchOrgUnitAggregate(orgUnitId, year = YEAR) {
  const { data, error } = await supabase.rpc('aggregate_org_unit_costs', {
    p_org_unit_id: orgUnitId, p_year: year,
  });
  if (error) console.error(error);
  return data?.[0] || null;
}

export async function fetchCompanyAggregate(companyId, year = YEAR) {
  const { data, error } = await supabase.rpc('aggregate_company_costs', {
    p_company_id: companyId, p_year: year,
  });
  if (error) console.error(error);
  return data?.[0] || null;
}
