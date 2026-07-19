import { useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';

export function useStaff(searchQuery = '') {
  const { staff, loadingStaff, error, refreshStaff } = useApp();

  const filteredStaff = useMemo(() => {
    if (!searchQuery) return staff;
    const lower = searchQuery.toLowerCase();
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.username.toLowerCase().includes(lower) ||
        s.email.toLowerCase().includes(lower) ||
        s.role.toLowerCase().includes(lower)
    );
  }, [staff, searchQuery]);

  const handleRefresh = useCallback(async () => {
    return refreshStaff(true);
  }, [refreshStaff]);

  return {
    staff: filteredStaff,
    allStaff: staff,
    loading: loadingStaff,
    error,
    refresh: handleRefresh
  };
}
