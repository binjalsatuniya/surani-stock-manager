import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fyOfDate } from '@surani/shared';
import { api } from '../lib/apiClient';

interface FyContextValue {
  fys: string[];
  selectedFy: string;
  setSelectedFy: (fy: string) => void;
  refreshFys: () => void;
}

const FyContext = createContext<FyContextValue | null>(null);

export function FinancialYearProvider({ children }: { children: ReactNode }) {
  const currentFy = fyOfDate(new Date().toISOString()) || '';
  const [fys, setFys] = useState<string[]>(currentFy ? [currentFy] : []);
  const [selectedFy, setSelectedFy] = useState<string>(currentFy);

  function refreshFys() {
    api.financialYears
      .list()
      .then((list) => {
        if (list.length) setFys(list);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshFys();
  }, []);

  return (
    <FyContext.Provider value={{ fys, selectedFy, setSelectedFy, refreshFys }}>{children}</FyContext.Provider>
  );
}

export function useFinancialYear() {
  const ctx = useContext(FyContext);
  if (!ctx) throw new Error('useFinancialYear must be used within FinancialYearProvider');
  return ctx;
}
