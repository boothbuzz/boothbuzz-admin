import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

export type OrganizationOption = {
  id: string;
  name: string;
};

/** Loads organizations for super-admin pickers. No-op for other roles. */
export function useOrganizations() {
  const { isSuperAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) {
      setOrganizations([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .from('organizations')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setOrganizations(data || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  return { organizations, loading, isSuperAdmin };
}
