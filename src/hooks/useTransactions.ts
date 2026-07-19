import { useState, useEffect, useCallback, useMemo } from 'react';
import { transactionService, PaginatedResult } from '../services/transactionService';
import { Transaction } from '../types';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

export function useTransactions(options: {
  pageSize?: number;
  typeFilter?: string;
  skuFilter?: string;
  globalSearch?: string;
} = {}) {
  const { pageSize = 30, typeFilter = 'ALL', skuFilter = '', globalSearch = '' } = options;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await transactionService.getTransactionsPaginated({
        pageSize,
        startAfterDoc: null,
        typeFilter,
        skuFilter
      });
      setTransactions(result.data);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat transaksi. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [pageSize, typeFilter, skuFilter]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial, retryCount]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await transactionService.getTransactionsPaginated({
        pageSize,
        startAfterDoc: lastDoc,
        typeFilter,
        skuFilter
      });
      setTransactions(prev => [...prev, ...result.data]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat transaksi tambahan.');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, lastDoc, pageSize, typeFilter, skuFilter]);

  // Live filter search query locally for optimal performance
  const filteredTransactions = useMemo(() => {
    if (!globalSearch) return transactions;
    const lower = globalSearch.toLowerCase();
    return transactions.filter(tx => 
      tx.sku.toLowerCase().includes(lower) ||
      tx.locatorId.toLowerCase().includes(lower) ||
      tx.operator.toLowerCase().includes(lower) ||
      tx.status.toLowerCase().includes(lower) ||
      (tx.memo && tx.memo.toLowerCase().includes(lower))
    );
  }, [transactions, globalSearch]);

  return {
    transactions: filteredTransactions,
    rawTransactions: transactions,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh: fetchInitial,
    retry: handleRetry
  };
}
