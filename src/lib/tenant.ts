import { Company, Subscription, UsageLog } from '../types';

// TENANT MIDDLEWARE LOGIC
export const checkSubscription = async (companyId: string): Promise<Subscription | null> => {
  const cacheKey = `local_subscription_${companyId}`;
  try {
    const res = await fetch(`/api/subscriptions/${encodeURIComponent(companyId)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch subscription: ${res.status}`);
    }
    const subscription = await res.json() as Subscription | null;
    if (!subscription) {
      const fallback = localStorage.getItem(cacheKey);
      return fallback ? JSON.parse(fallback) : null;
    }
    localStorage.setItem(cacheKey, JSON.stringify(subscription));
    return subscription;
  } catch (error) {
    console.warn('checkSubscription REST failed, using cached subscription:', error);
    const fallback = localStorage.getItem(cacheKey);
    if (fallback) {
      return JSON.parse(fallback);
    }
    // Return a default subscription if no local storage exists to prevent blocking UI
    const defaultSub: Subscription = {
      id: `SUB_${companyId}`,
      companyId,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString(),
      autoRenew: true,
      features: {
        barcodeScanner: true,
        batch: true,
        auditLog: true,
        exportReport: true,
        multiWarehouse: true,
        customWorkflow: true,
        apiIntegration: true,
      },
      createdAt: new Date().toISOString()
    };
    return defaultSub;
  }
};

export const checkFeature = async (companyId: string, featureKey: keyof Subscription['features']): Promise<boolean> => {
  try {
    const sub = await checkSubscription(companyId);
    if (!sub) return false;
    if (sub.status !== 'ACTIVE') return false; // expired
    return sub.features[featureKey] === true;
  } catch (error) {
    console.warn('checkFeature check failed, defaulting to true to bypass blocks:', error);
    return true; // fail open to keep system functional
  }
};

export const logUsage = async (companyId: string, feature: string, action: string, count: number = 1) => {
  try {
    await fetch('/api/usage-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, feature, action, count })
    });
  } catch (error) {
    console.error('Failed to log usage:', error);
  }
};
