import { Locator, Product, Transaction } from '../types';

export interface WarehouseOccupancyMetrics {
  totalMaxVolume: number;
  totalUsedVolume: number;
  totalRemainingVolume: number;
  occupancyPercentage: number;
  totalSlotsCount: number;
  occupiedSlotsCount: number;
  emptySlotsCount: number;
  slotOccupancyRate: number;
  avgUsedPerOccupiedRack: number;
}

/**
 * Kalkulasi Total Occupancy & Metrik Gudang yang disinkronkan secara konsisten
 * antara Control Stock dan Dashboard.
 */
export function calculateWarehouseOccupancy(
  products: Product[],
  transactions: Transaction[],
  locators: Locator[]
): WarehouseOccupancyMetrics {
  const productMap = new Map<string, Product>();
  products.forEach(p => productMap.set(p.sku, p));

  const locatorMap = new Map<string, { qtyIn: number; qtyOut: number; systemLocator?: string }>();

  transactions.forEach((tx: Transaction) => {
    if (tx.status !== 'CONFIRMED') return;

    switch (tx.type) {
      case 'INBOUND': {
        const key = `${tx.sku}:::${tx.locatorId}`;
        const current = locatorMap.get(key) || { qtyIn: 0, qtyOut: 0, systemLocator: tx.systemLocator || 'PSN-JKT C3' };
        current.qtyIn += tx.qty;
        if (tx.systemLocator) current.systemLocator = tx.systemLocator;
        locatorMap.set(key, current);
        break;
      }
      case 'OUTBOUND': {
        const key = `${tx.sku}:::${tx.locatorId}`;
        const current = locatorMap.get(key) || { qtyIn: 0, qtyOut: 0, systemLocator: tx.systemLocator || 'PSN-JKT C3' };
        current.qtyOut += tx.qty;
        if (tx.systemLocator) current.systemLocator = tx.systemLocator;
        locatorMap.set(key, current);
        break;
      }
      case 'TRANSFER': {
        // Out from source locator
        const outKey = `${tx.sku}:::${tx.locatorId}`;
        const outCurrent = locatorMap.get(outKey) || { qtyIn: 0, qtyOut: 0, systemLocator: 'PSN-JKT C3' };
        outCurrent.qtyOut += tx.qty;
        locatorMap.set(outKey, outCurrent);

        // In to target locator
        if (tx.transferToLocatorId) {
          const inKey = `${tx.sku}:::${tx.transferToLocatorId}`;
          const inCurrent = locatorMap.get(inKey) || { qtyIn: 0, qtyOut: 0, systemLocator: 'PSN-JKT C3' };
          inCurrent.qtyIn += tx.qty;
          locatorMap.set(inKey, inCurrent);
        }
        break;
      }
    }
  });

  // Hitung total volume per locator
  const slotTotalVolMap = new Map<string, number>();
  locatorMap.forEach((stats, key) => {
    const [sku, locatorId] = key.split(':::');
    const prod = productMap.get(sku);
    const onHand = Math.max(0, stats.qtyIn + stats.qtyOut);
    const volPerUnit = prod?.volumeM3 || 0;
    const itemVol = onHand * volPerUnit;
    slotTotalVolMap.set(locatorId, (slotTotalVolMap.get(locatorId) || 0) + itemVol);
  });

  const allLocIds = new Set<string>();
  locators.forEach(l => allLocIds.add(l.id));
  slotTotalVolMap.forEach((_, locId) => allLocIds.add(locId));

  const locById = new Map<string, Locator>();
  locators.forEach(l => locById.set(l.id, l));

  let totalMaxVolume = 0;
  let totalUsedVolume = 0;
  let occupiedSlotsCount = 0;

  allLocIds.forEach(locId => {
    const loc = locById.get(locId);
    const usedVol = slotTotalVolMap.get(locId) || 0;
    const maxVol = loc?.maxVolumeM3 || 5.4;

    totalMaxVolume += maxVol;
    totalUsedVolume += usedVol;
    if (usedVol > 0) {
      occupiedSlotsCount++;
    }
  });

  const totalRemainingVolume = Math.max(0, totalMaxVolume - totalUsedVolume);
  const occupancyPercentage = totalMaxVolume > 0 
    ? Math.max(0, Math.min(100, (totalUsedVolume / totalMaxVolume) * 100)) 
    : 0;

  const totalSlotsCount = allLocIds.size;
  const emptySlotsCount = Math.max(0, totalSlotsCount - occupiedSlotsCount);
  const slotOccupancyRate = totalSlotsCount > 0 ? (occupiedSlotsCount / totalSlotsCount) * 100 : 0;
  const avgUsedPerOccupiedRack = occupiedSlotsCount > 0 ? totalUsedVolume / occupiedSlotsCount : 0;

  return {
    totalMaxVolume,
    totalUsedVolume,
    totalRemainingVolume,
    occupancyPercentage,
    totalSlotsCount,
    occupiedSlotsCount,
    emptySlotsCount,
    slotOccupancyRate,
    avgUsedPerOccupiedRack
  };
}
