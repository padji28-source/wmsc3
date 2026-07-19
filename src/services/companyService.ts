import { Company, Subscription } from '../types';

let cachedCompanies: Company[] | null = null;
let cachedSubscriptions: Subscription[] | null = null;

export const companyService = {
  getCompanies: async (forceRefresh = false): Promise<Company[]> => {
    if (cachedCompanies && !forceRefresh) {
      return cachedCompanies;
    }

    try {
      const response = await fetch('/api/companies');
      if (response.ok) {
        const c = await response.json();
        cachedCompanies = c;
        return c;
      }
      throw new Error(`Server returned ${response.status}`);
    } catch (err) {
      console.warn("MongoDB companyService.getCompanies failed, using local fallback", err);
      const fallback: Company[] = [
        { id: 'COMPANY_C3_CORP', name: 'Gudang Utama C3 Corp', status: 'ACTIVE', createdAt: new Date().toISOString() } as Company
      ];
      if (!cachedCompanies) cachedCompanies = fallback;
      return fallback;
    }
  },

  getSubscriptions: async (forceRefresh = false): Promise<Subscription[]> => {
    if (cachedSubscriptions && !forceRefresh) {
      return cachedSubscriptions;
    }

    try {
      const response = await fetch('/api/subscriptions');
      if (response.ok) {
        const s = await response.json();
        cachedSubscriptions = s;
        return s;
      }
      throw new Error(`Server returned ${response.status}`);
    } catch (err) {
      console.warn("MongoDB companyService.getSubscriptions failed, using local fallback", err);
      const fallback: Subscription[] = [
        { id: 'SUB_C3', companyId: 'COMPANY_C3_CORP', plan: 'ENTERPRISE', status: 'ACTIVE', createdAt: new Date().toISOString() } as Subscription
      ];
      if (!cachedSubscriptions) cachedSubscriptions = fallback;
      return fallback;
    }
  },

  clearCache: () => {
    cachedCompanies = null;
    cachedSubscriptions = null;
  }
};
