import { Transaction } from '../types';
import { getCurrentCompanyId, isGlobalDeveloper } from '../lib/db';

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: any; // Dynamic document reference for interface compatibility
  hasMore: boolean;
  total?: number;
}

export const transactionService = {
  /**
   * Fetches transactions from MongoDB API with pagination.
   */
  getTransactionsPaginated: async (options: {
    pageSize: number;
    startAfterDoc?: any;
    typeFilter?: string;
    skuFilter?: string;
  }): Promise<PaginatedResult<Transaction>> => {
    const companyId = getCurrentCompanyId();
    const { pageSize, startAfterDoc, typeFilter, skuFilter } = options;

    try {
      const companyIdParam = (!isGlobalDeveloper() && companyId) ? `&companyId=${companyId}` : '';
      const typeFilterParam = typeFilter ? `&typeFilter=${typeFilter}` : '';
      const skuFilterParam = skuFilter ? `&skuFilter=${skuFilter}` : '';
      const startAfterIdParam = startAfterDoc ? `&startAfterId=${startAfterDoc.id || startAfterDoc}` : '';

      const response = await fetch(`/api/transactions?pageSize=${pageSize}${companyIdParam}${typeFilterParam}${skuFilterParam}${startAfterIdParam}`);
      if (response.ok) {
        const result = await response.json();
        return {
          data: result.data,
          lastDoc: result.lastDocId ? { id: result.lastDocId } : null,
          hasMore: result.hasMore
        };
      }
      throw new Error(`Server returned ${response.status}`);
    } catch (err) {
      console.warn("MongoDB getTransactionsPaginated failed, falling back to local simulation", err);
      // Local fallback with simulated pagination
      const localKey = companyId ? 'local_transactions_' + companyId : 'local_transactions_all';
      const rawData = localStorage.getItem(localKey);
      let localTxs: Transaction[] = rawData ? JSON.parse(rawData) : [];

      // Filter local
      if (typeFilter && typeFilter !== 'ALL') {
        localTxs = localTxs.filter(t => t.type === typeFilter);
      }
      if (skuFilter) {
        localTxs = localTxs.filter(t => t.sku.toLowerCase() === skuFilter.toLowerCase());
      }

      // Sort local
      localTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Slice local
      let startIndex = 0;
      if (startAfterDoc) {
        const prevId = startAfterDoc.id || startAfterDoc || '';
        const idx = localTxs.findIndex(t => t.id === prevId);
        if (idx !== -1) {
          startIndex = idx + 1;
        }
      }

      const paginatedLocal = localTxs.slice(startIndex, startIndex + pageSize);
      const fakeLastDoc = paginatedLocal.length > 0 
        ? { id: paginatedLocal[paginatedLocal.length - 1].id } 
        : null;

      return {
        data: paginatedLocal,
        lastDoc: fakeLastDoc,
        hasMore: startIndex + pageSize < localTxs.length
      };
    }
  }
};
