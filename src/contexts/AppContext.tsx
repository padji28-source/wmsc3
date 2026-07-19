import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Product, Locator, Transaction } from '../types';
import { getProducts, getLocators, getTransactions } from '../lib/db';
import { staffService, StaffMember } from '../services/staffService';
import { companyService } from '../services/companyService';
import { getCurrentUser } from '../lib/auth';
import { ToastContainer, ToastType } from '../components/Toast';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface AppContextType {
  products: Product[];
  locators: Locator[];
  transactions: Transaction[];
  staff: StaffMember[];
  loadingProducts: boolean;
  loadingLocators: boolean;
  loadingTransactions: boolean;
  loadingStaff: boolean;
  error: string | null;
  
  refreshProducts: (force?: boolean) => Promise<Product[]>;
  refreshLocators: (force?: boolean) => Promise<Locator[]>;
  refreshTransactions: (force?: boolean) => Promise<Transaction[]>;
  refreshStaff: (force?: boolean) => Promise<StaffMember[]>;
  
  clearAllCache: () => void;
  showToast: (message: string, type?: ToastType) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingLocators, setLoadingLocators] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  const currentUser = useMemo(() => getCurrentUser(), []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshProducts = useCallback(async (force = false) => {
    setLoadingProducts(true);
    try {
      // getProducts has internal caching, but we can pass flags if needed or clear the internal cache.
      const data = await getProducts();
      setProducts(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err?.message || "Failed to fetch products");
      showToast(err?.message || "Failed to fetch products", 'error');
      return [];
    } finally {
      setLoadingProducts(false);
    }
  }, [showToast]);

  const refreshLocators = useCallback(async (force = false) => {
    setLoadingLocators(true);
    try {
      const data = await getLocators();
      setLocators(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err?.message || "Failed to fetch locators");
      showToast(err?.message || "Failed to fetch locators", 'error');
      return [];
    } finally {
      setLoadingLocators(false);
    }
  }, [showToast]);

  const refreshTransactions = useCallback(async (force = false) => {
    setLoadingTransactions(true);
    try {
      const data = await getTransactions();
      setTransactions(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err?.message || "Failed to fetch transactions");
      showToast(err?.message || "Failed to fetch transactions", 'error');
      return [];
    } finally {
      setLoadingTransactions(false);
    }
  }, [showToast]);

  const refreshStaff = useCallback(async (force = false) => {
    setLoadingStaff(true);
    try {
      const userObj = getCurrentUser();
      const data = await staffService.getStaff(userObj, force);
      setStaff(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err?.message || "Failed to fetch staff list");
      showToast(err?.message || "Failed to fetch staff list", 'error');
      return [];
    } finally {
      setLoadingStaff(false);
    }
  }, [showToast]);

  const clearAllCache = useCallback(() => {
    setProducts([]);
    setLocators([]);
    setTransactions([]);
    setStaff([]);
    staffService.clearCache();
    companyService.clearCache();
  }, []);

  // Initial load when user exists
  useEffect(() => {
    const userObj = getCurrentUser();
    if (userObj) {
      refreshProducts();
      refreshLocators();
      refreshTransactions();
      refreshStaff();
    }
  }, [refreshProducts, refreshLocators, refreshTransactions, refreshStaff]);

  const value = useMemo(() => ({
    products,
    locators,
    transactions,
    staff,
    loadingProducts,
    loadingLocators,
    loadingTransactions,
    loadingStaff,
    error,
    refreshProducts,
    refreshLocators,
    refreshTransactions,
    refreshStaff,
    clearAllCache,
    showToast
  }), [
    products, locators, transactions, staff,
    loadingProducts, loadingLocators, loadingTransactions, loadingStaff,
    error, refreshProducts, refreshLocators, refreshTransactions, refreshStaff,
    clearAllCache, showToast
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
