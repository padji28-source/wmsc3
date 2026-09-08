import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  Search, 
  RefreshCw, 
  Box, 
  Download, 
  Database, 
  BarChart3, 
  TrendingUp, 
  AlertTriangle,
  Grid,
  ListFilter,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  ArrowUpRight
} from 'lucide-react';
import { getProducts, getTransactions, getLocators } from '../lib/db';
import { Product, Transaction, Locator } from '../types';

interface ControlStockRow {
  sku: string;
  name: string;
  category: string;
  packingSize: number | undefined;
  packUom: string | undefined;
  uom: string;
  locatorId: string;
  systemLocator?: string;
  qtyIn: number;
  qtyOut: number;
  onHand: number;
  volumeM3: number;
  usedVolumeM3: number;
  slotMaxVolumeM3: number;
  slotTotalUsedVolumeM3: number;
  slotOccupancyPct: number;
}

interface RackVolumeDetail {
  locatorId: string;
  rack: string;
  column: string;
  level: number;
  zone: string;
  maxVolumeM3: number;
  usedVolumeM3: number;
  remainingVolumeM3: number;
  occupancyPct: number;
  itemCount: number;
  totalUnits: number;
  items: Array<{
    sku: string;
    name: string;
    category: string;
    onHand: number;
    uom: string;
    volumeM3: number;
    usedVolumeM3: number;
  }>;
  status: 'EMPTY' | 'OPTIMAL' | 'NEAR_FULL' | 'FULL';
}

export function ControlStock({ searchQuery = '' }: { searchQuery?: string }) {
  const [data, setData] = useState<ControlStockRow[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [activeTab, setActiveTab] = useState<'items' | 'racks'>('items');
  const [rackStatusFilter, setRackStatusFilter] = useState<'ALL' | 'OCCUPIED' | 'NEAR_FULL' | 'FULL' | 'EMPTY'>('ALL');
  const [expandedRackId, setExpandedRackId] = useState<string | null>(null);

  const activeSearchValue = searchQuery || localSearch;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [products, transactions, locs] = await Promise.all([
        getProducts(),
        getTransactions(),
        getLocators()
      ]);

      setLocators(locs);

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

      // Calculate total volume per rack slot
      const slotTotalVolMap = new Map<string, number>();
      locatorMap.forEach((stats, key) => {
        const [sku, locatorId] = key.split(':::');
        const prod = productMap.get(sku);
        const onHand = Math.max(0, stats.qtyIn + stats.qtyOut);
        const volPerUnit = prod?.volumeM3 || 0;
        const itemVol = onHand * volPerUnit;
        slotTotalVolMap.set(locatorId, (slotTotalVolMap.get(locatorId) || 0) + itemVol);
      });

      const locById = new Map<string, Locator>();
      locs.forEach(l => locById.set(l.id, l));

      const rows: ControlStockRow[] = [];
      locatorMap.forEach((stats, key) => {
        const [sku, locatorId] = key.split(':::');
        const prod = productMap.get(sku);
        if (prod) {
          const onHand = Math.max(0, stats.qtyIn + stats.qtyOut);
          const volPerUnit = prod.volumeM3 || 0;
          const usedVol = onHand * volPerUnit;
          const loc = locById.get(locatorId);
          const slotMaxVol = loc?.maxVolumeM3 || 5.4;
          const slotTotalUsedVol = slotTotalVolMap.get(locatorId) || 0;
          const slotPct = slotMaxVol > 0 ? Math.min(100, Math.round((slotTotalUsedVol / slotMaxVol) * 100)) : 0;

          rows.push({
            sku: prod.sku,
            name: prod.name,
            category: prod.category,
            packingSize: prod.packingSize,
            packUom: prod.packUom,
            uom: prod.uom || 'PCS',
            locatorId: locatorId,
            systemLocator: stats.systemLocator,
            qtyIn: stats.qtyIn,
            qtyOut: stats.qtyOut,
            onHand: onHand,
            volumeM3: volPerUnit,
            usedVolumeM3: usedVol,
            slotMaxVolumeM3: slotMaxVol,
            slotTotalUsedVolumeM3: slotTotalUsedVol,
            slotOccupancyPct: slotPct
          });
        }
      });

      // Sort rows by SKU then Locator
      rows.sort((a, b) => {
        const skuCompare = a.sku.localeCompare(b.sku);
        if (skuCompare !== 0) return skuCompare;
        return a.locatorId.localeCompare(b.locatorId);
      });

      setData(rows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Synchronize local search with parent searchQuery prop if it changes
  useEffect(() => {
    if (searchQuery !== undefined) {
      setLocalSearch(searchQuery);
    }
  }, [searchQuery]);

  // Comprehensive Rack-Level Volume Details for EACH rack in the warehouse
  const rackVolumeList: RackVolumeDetail[] = useMemo(() => {
    const itemsByLoc = new Map<string, ControlStockRow[]>();
    data.forEach(row => {
      if (!itemsByLoc.has(row.locatorId)) {
        itemsByLoc.set(row.locatorId, []);
      }
      itemsByLoc.get(row.locatorId)!.push(row);
    });

    const allLocIds = new Set<string>();
    locators.forEach(l => allLocIds.add(l.id));
    itemsByLoc.forEach((_, locId) => allLocIds.add(locId));

    const locById = new Map<string, Locator>();
    locators.forEach(l => locById.set(l.id, l));

    const list: RackVolumeDetail[] = [];
    allLocIds.forEach(locId => {
      const loc = locById.get(locId);
      const items = itemsByLoc.get(locId) || [];
      const usedVol = items.reduce((sum, item) => sum + item.usedVolumeM3, 0);
      const maxVol = loc?.maxVolumeM3 || 5.4;
      const remainingVol = Math.max(0, maxVol - usedVol);
      const occupancyPct = maxVol > 0 ? Math.min(100, Math.round((usedVol / maxVol) * 100)) : 0;
      const totalUnits = items.reduce((sum, item) => sum + item.onHand, 0);

      let status: 'EMPTY' | 'OPTIMAL' | 'NEAR_FULL' | 'FULL' = 'EMPTY';
      if (usedVol <= 0) {
        status = 'EMPTY';
      } else if (occupancyPct >= 90) {
        status = 'FULL';
      } else if (occupancyPct >= 75) {
        status = 'NEAR_FULL';
      } else {
        status = 'OPTIMAL';
      }

      list.push({
        locatorId: locId,
        rack: loc?.rack || locId.split('-')[0] || '-',
        column: loc?.column || '-',
        level: loc?.level || 1,
        zone: loc?.zone || 'DEFAULT',
        maxVolumeM3: maxVol,
        usedVolumeM3: usedVol,
        remainingVolumeM3: remainingVol,
        occupancyPct: occupancyPct,
        itemCount: items.length,
        totalUnits: totalUnits,
        items: items.map(i => ({
          sku: i.sku,
          name: i.name,
          category: i.category,
          onHand: i.onHand,
          uom: i.uom,
          volumeM3: i.volumeM3,
          usedVolumeM3: i.usedVolumeM3
        })),
        status
      });
    });

    // Natural sort by Rack and Locator ID
    list.sort((a, b) => a.locatorId.localeCompare(b.locatorId, undefined, { numeric: true, sensitivity: 'base' }));
    return list;
  }, [locators, data]);

  // Warehouse-wide Total Occupancy & Capacity Metrics (ALL RAK)
  const warehouseMetrics = useMemo(() => {
    const totalMaxVolume = rackVolumeList.reduce((sum, r) => sum + r.maxVolumeM3, 0);
    const totalUsedVolume = rackVolumeList.reduce((sum, r) => sum + r.usedVolumeM3, 0);
    const totalRemainingVolume = Math.max(0, totalMaxVolume - totalUsedVolume);
    const occupancyPercentage = totalMaxVolume > 0 ? (totalUsedVolume / totalMaxVolume) * 100 : 0;

    const totalSlotsCount = rackVolumeList.length;
    const occupiedSlotsCount = rackVolumeList.filter(r => r.usedVolumeM3 > 0).length;
    const emptySlotsCount = totalSlotsCount - occupiedSlotsCount;
    const slotOccupancyRate = totalSlotsCount > 0 ? (occupiedSlotsCount / totalSlotsCount) * 100 : 0;
    const avgUsedPerOccupiedRack = occupiedSlotsCount > 0 ? totalUsedVolume / occupiedSlotsCount : 0;

    return {
      totalMaxVolume,
      totalUsedVolume,
      totalRemainingVolume,
      occupancyPercentage: Math.max(0, Math.min(100, occupancyPercentage)),
      totalSlotsCount,
      occupiedSlotsCount,
      emptySlotsCount,
      slotOccupancyRate,
      avgUsedPerOccupiedRack
    };
  }, [rackVolumeList]);

  // Filtered Item Rows
  const filteredData = data.filter(r => {
    const term = activeSearchValue.toLowerCase();
    return (
      r.sku.toLowerCase().includes(term) ||
      r.name.toLowerCase().includes(term) ||
      r.locatorId.toLowerCase().includes(term) ||
      r.category.toLowerCase().includes(term)
    );
  });

  // Filtered Rack Rows
  const filteredRacks = rackVolumeList.filter(r => {
    const term = activeSearchValue.toLowerCase();
    const matchesSearch = 
      r.locatorId.toLowerCase().includes(term) ||
      r.rack.toLowerCase().includes(term) ||
      r.zone.toLowerCase().includes(term) ||
      r.items.some(item => item.sku.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (rackStatusFilter === 'OCCUPIED') return r.usedVolumeM3 > 0;
    if (rackStatusFilter === 'NEAR_FULL') return r.status === 'NEAR_FULL';
    if (rackStatusFilter === 'FULL') return r.status === 'FULL';
    if (rackStatusFilter === 'EMPTY') return r.status === 'EMPTY';
    return true;
  });

  // --- PERHITUNGAN GRAND TOTAL DATA TERFILTER ---
  const grandTotalQtyIn = filteredData.reduce((sum, row) => sum + row.qtyIn, 0);
  const grandTotalQtyOut = filteredData.reduce((sum, row) => sum + row.qtyOut, 0);
  const grandTotalOnHand = filteredData.reduce((sum, row) => sum + row.onHand, 0);
  const grandTotalVolumeM3 = filteredData.reduce((sum, row) => sum + row.usedVolumeM3, 0);

  // Racks tab totals for filtered list
  const filteredRacksTotalUsedVol = filteredRacks.reduce((sum, r) => sum + r.usedVolumeM3, 0);
  const filteredRacksTotalMaxVol = filteredRacks.reduce((sum, r) => sum + r.maxVolumeM3, 0);
  const filteredRacksTotalRemainingVol = Math.max(0, filteredRacksTotalMaxVol - filteredRacksTotalUsedVol);
  const filteredRacksOccupancyPct = filteredRacksTotalMaxVol > 0 ? (filteredRacksTotalUsedVol / filteredRacksTotalMaxVol) * 100 : 0;
  const filteredRacksTotalUnits = filteredRacks.reduce((sum, r) => sum + r.totalUnits, 0);

  const exportToCSV = () => {
    if (activeTab === 'items') {
      if (filteredData.length === 0) return;
      
      const headers = [
        'KODE PRODUK', 
        'DESKRIPSI NAMA', 
        'KATEGORI RAK', 
        'PACKAGING / UOM', 
        'POSISI RAK (SLOT)', 
        'QTY IN', 
        'QTY OUT', 
        'JUMLAH ON HAND',
        'VOL BARANG (M3)',
        'VOL TERPAKAI RAK (M3)',
        'KAPASITAS RAK (M3)',
        'OCCUPANCY RAK (%)'
      ];
      
      const rows = filteredData.map(row => {
        const pkgUom = row.packUom && row.packingSize 
          ? `${row.packingSize} ${row.uom} / ${row.packUom}`
          : row.uom || '-';

        const cleanSku = (row.sku || '').replace(/"/g, '""');
        const cleanName = (row.name || '').replace(/"/g, '""');
        const cleanCategory = (row.category || '').replace(/"/g, '""');
        const cleanPkg = pkgUom.replace(/"/g, '""');
        const cleanLocator = (row.locatorId || '').replace(/"/g, '""');
        const onHand = row.onHand;

        return `"${cleanSku}";"${cleanName}";"${cleanCategory}";"${cleanPkg}";"${cleanLocator}";${row.qtyIn};${row.qtyOut};${onHand};${row.usedVolumeM3.toFixed(3)};${row.slotTotalUsedVolumeM3.toFixed(3)};${row.slotMaxVolumeM3.toFixed(1)};${row.slotOccupancyPct}%`;
      });

      const totalRow = `"GRAND TOTAL (ALL RAK)";"";"";"";"";${grandTotalQtyIn};${grandTotalQtyOut};${grandTotalOnHand};${grandTotalVolumeM3.toFixed(3)};${warehouseMetrics.totalUsedVolume.toFixed(3)};${warehouseMetrics.totalMaxVolume.toFixed(1)};${warehouseMetrics.occupancyPercentage.toFixed(1)}%`;

      const csvContent = '\uFEFF' + [
        'sep=;',
        headers.map(h => `"${h}"`).join(';'),
        ...rows,
        totalRow
      ].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Control_Stock_Items_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      if (filteredRacks.length === 0) return;

      const headers = [
        'POSISI RAK (SLOT)',
        'KODE RAK',
        'KOLOM',
        'TINGKAT',
        'ZONA',
        'VOL TERPAKAI (M3)',
        'KAPASITAS MAKSIMAL (M3)',
        'SISA VOLUME TERSEDIA (M3)',
        'OCCUPANCY (%)',
        'JUMLAH SKU',
        'TOTAL UNIT ON-HAND',
        'STATUS'
      ];

      const rows = filteredRacks.map(r => {
        const cleanLoc = r.locatorId.replace(/"/g, '""');
        const cleanRack = r.rack.replace(/"/g, '""');
        const cleanCol = r.column.replace(/"/g, '""');
        const cleanZone = r.zone.replace(/"/g, '""');
        const statusLabel = r.status === 'EMPTY' ? 'Kosong' : r.status === 'FULL' ? 'Penuh (>=90%)' : r.status === 'NEAR_FULL' ? 'Hampir Penuh (>=75%)' : 'Optimal';

        return `"${cleanLoc}";"${cleanRack}";"${cleanCol}";${r.level};"${cleanZone}";${r.usedVolumeM3.toFixed(3)};${r.maxVolumeM3.toFixed(1)};${r.remainingVolumeM3.toFixed(3)};${r.occupancyPct}%;${r.itemCount};${r.totalUnits};"${statusLabel}"`;
      });

      const totalRow = `"TOTAL ALL RAK";"";"";"";"";${filteredRacksTotalUsedVol.toFixed(3)};${filteredRacksTotalMaxVol.toFixed(1)};${filteredRacksTotalRemainingVol.toFixed(3)};${filteredRacksOccupancyPct.toFixed(1)}%;"";${filteredRacksTotalUnits};""`;

      const csvContent = '\uFEFF' + [
        'sep=;',
        headers.map(h => `"${h}"`).join(';'),
        ...rows,
        totalRow
      ].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Control_Stock_Volume_Per_Rak_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6 max-w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Box className="w-6 h-6 text-blue-600" />
            Control Stock & Kapasitas Rak
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm">
            Monitoring Total Volume Terpakai (All Rak) dan Rincian Volume Masing-Masing Slot Rak Gudang.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64 hidden sm:block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={activeSearchValue}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={activeTab === 'items' ? "Cari SKU, Nama, Rak..." : "Cari ID Rak, Zona, SKU..."}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            onClick={exportToCSV}
            disabled={activeTab === 'items' ? filteredData.length === 0 : filteredRacks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            title="Download Spreadsheet"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* METRICS SUMMARY CARDS: TOTAL VOLUME TERPAKAI ALL RAK & MASING-MASING RAK */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Volume Terpakai (All Rak) */}
        <div className="bg-gradient-to-br from-white to-blue-50/40 p-5 rounded-xl border border-blue-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-600" />
                  Total Vol Terpakai (All Rak)
                </p>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-3xl font-black text-blue-950 font-mono">
                    {warehouseMetrics.totalUsedVolume.toFixed(3)}
                  </span>
                  <span className="text-sm font-black text-blue-700 font-mono">M³</span>
                </div>
              </div>
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                warehouseMetrics.occupancyPercentage >= 90 ? 'bg-rose-100 text-rose-700' :
                warehouseMetrics.occupancyPercentage >= 75 ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {warehouseMetrics.occupancyPercentage.toFixed(1)}% Terisi
              </span>
            </div>
            
            {/* Occupancy Progress Bar */}
            <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  warehouseMetrics.occupancyPercentage >= 90 ? 'bg-rose-500' :
                  warehouseMetrics.occupancyPercentage >= 75 ? 'bg-amber-500' :
                  'bg-blue-600'
                }`}
                style={{ width: `${Math.min(100, warehouseMetrics.occupancyPercentage)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 font-medium pt-2 border-t border-blue-100 mt-1">
            <span>Kapasitas: <strong className="text-slate-800 font-mono">{warehouseMetrics.totalMaxVolume.toFixed(1)} M³</strong></span>
            <span className="text-emerald-700 font-bold">Sisa: {warehouseMetrics.totalRemainingVolume.toFixed(3)} M³</span>
          </div>
        </div>

        {/* 2. Total Occupancy (All Rak) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Occupancy All Rak</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-slate-900">
                    {warehouseMetrics.occupancyPercentage.toFixed(1)}%
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    warehouseMetrics.occupancyPercentage >= 90 ? 'bg-rose-100 text-rose-700' :
                    warehouseMetrics.occupancyPercentage >= 75 ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {warehouseMetrics.occupancyPercentage >= 90 ? 'Kritis' :
                     warehouseMetrics.occupancyPercentage >= 75 ? 'Hampir Penuh' : 'Optimal'}
                  </span>
                </div>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Box className="w-5 h-5" />
              </div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  warehouseMetrics.occupancyPercentage >= 90 ? 'bg-rose-500' :
                  warehouseMetrics.occupancyPercentage >= 75 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, warehouseMetrics.occupancyPercentage)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1 border-t border-slate-100 mt-2">
            <span className="text-slate-700 font-bold">{warehouseMetrics.occupiedSlotsCount} Rak Terisi</span>
            <span>{warehouseMetrics.emptySlotsCount} Rak Kosong</span>
          </div>
        </div>

        {/* 3. Utilisasi Slot Masing-Masing Rak */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rata-rata Vol / Rak Terisi</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-black text-slate-900 font-mono">
                    {warehouseMetrics.avgUsedPerOccupiedRack.toFixed(3)}
                  </span>
                  <span className="text-xs font-bold text-slate-500 font-mono">M³/Rak</span>
                </div>
              </div>
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-purple-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, warehouseMetrics.slotOccupancyRate)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1 border-t border-slate-100 mt-2">
            <span className="text-purple-700 font-bold">{warehouseMetrics.slotOccupancyRate.toFixed(1)}% Slot Terisi</span>
            <span>Total {warehouseMetrics.totalSlotsCount} Slot Rak</span>
          </div>
        </div>

        {/* 4. Total Fisik On-Hand */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Fisik On-Hand</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-black text-slate-900">
                  {grandTotalOnHand.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-slate-500">Unit</span>
              </div>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1 border-t border-slate-100 mt-2">
            <span className="text-blue-600 font-bold">+{grandTotalQtyIn.toLocaleString()} In</span>
            <span className="text-red-600 font-bold">{grandTotalQtyOut.toLocaleString()} Out</span>
          </div>
        </div>
      </div>

      {/* VIEW MODE TABS: RINCIAN PRODUK VS VOLUME MASING-MASING RAK */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('items')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'items'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>Rincian Stok & Volume Per Item ({filteredData.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('racks')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'racks'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Volume Masing-Masing Rak ({rackVolumeList.length} Slot)</span>
          </button>
        </div>

        {/* Quick Filter when in Racks view */}
        {activeTab === 'racks' && (
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-slate-400 font-medium mr-1 hidden sm:inline">Filter Rak:</span>
            <button
              onClick={() => setRackStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                rackStatusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({rackVolumeList.length})
            </button>
            <button
              onClick={() => setRackStatusFilter('OCCUPIED')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                rackStatusFilter === 'OCCUPIED' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Terisi ({warehouseMetrics.occupiedSlotsCount})
            </button>
            <button
              onClick={() => setRackStatusFilter('NEAR_FULL')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                rackStatusFilter === 'NEAR_FULL' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Hampir Penuh ({rackVolumeList.filter(r => r.status === 'NEAR_FULL').length})
            </button>
            <button
              onClick={() => setRackStatusFilter('FULL')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                rackStatusFilter === 'FULL' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Penuh ({rackVolumeList.filter(r => r.status === 'FULL').length})
            </button>
            <button
              onClick={() => setRackStatusFilter('EMPTY')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                rackStatusFilter === 'EMPTY' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              Kosong ({warehouseMetrics.emptySlotsCount})
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: RINCIAN PER ITEM / STOK DENGAN KOLOM VOLUME RAK */}
      {activeTab === 'items' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">KODE PRODUK</th>
                  <th className="px-6 py-4">DESKRIPSI NAMA</th>
                  <th className="px-6 py-4">KATEGORI RAK</th>
                  <th className="px-6 py-4">PACKAGING / UOM</th>
                  <th className="px-6 py-4">POSISI RAK (SLOT)</th>
                  <th className="px-6 py-4 text-right">QTY IN</th>
                  <th className="px-6 py-4 text-right">QTY OUT</th>
                  <th className="px-6 py-4 text-right">JUMLAH ON HAND</th>
                  <th className="px-6 py-4 text-right">VOL BARANG (M³)</th>
                  <th className="px-6 py-4 text-right">VOL TERPAKAI RAK (SLOT)</th>
                  <th className="px-6 py-4 text-right">OCCUPANCY RAK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-500 mb-3" />
                      <p className="font-medium text-sm">Menghitung Data Stock & Occupancy...</p>
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((row, idx) => (
                    <tr key={`${row.sku}-${row.locatorId}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3 font-bold text-blue-700">{row.sku}</td>
                      <td className="px-6 py-3 font-semibold text-slate-800">{row.name}</td>
                      <td className="px-6 py-3">
                        <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-[10px] font-bold">
                          {row.category}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-500 font-medium">
                        {row.packUom && row.packingSize ? (
                          <>
                            <span className="text-slate-800 font-bold">{row.packingSize}</span> {row.uom} / {row.packUom}
                          </>
                        ) : (
                          <span>{row.uom}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 font-bold text-emerald-700">
                        {row.locatorId}
                        {row.systemLocator && (
                          <div className="text-[9px] text-emerald-600/70 mt-0.5">{row.systemLocator}</div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-blue-600 bg-blue-50/30">
                        {row.qtyIn}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-red-600 bg-red-50/30">
                        {row.qtyOut}
                      </td>
                      <td className="px-6 py-3 text-right font-black text-slate-800 bg-slate-50 text-sm">
                        {row.onHand} <span className="text-[10px] font-bold text-slate-500 ml-1">{row.uom}</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-medium text-slate-700">
                        {row.usedVolumeM3.toFixed(3)} <span className="text-[10px] text-slate-400">M³</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        <div className="font-bold text-slate-900">
                          {row.slotTotalUsedVolumeM3.toFixed(3)} <span className="text-[10px] text-slate-400 font-normal">/ {row.slotMaxVolumeM3.toFixed(1)} M³</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                row.slotOccupancyPct >= 90 ? 'bg-rose-500' :
                                row.slotOccupancyPct >= 75 ? 'bg-amber-500' :
                                'bg-blue-600'
                              }`}
                              style={{ width: `${Math.min(100, row.slotOccupancyPct)}%` }}
                            />
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            row.slotOccupancyPct >= 90 ? 'bg-rose-100 text-rose-700' :
                            row.slotOccupancyPct >= 75 ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-50 text-blue-700'
                          }`}>
                            {row.slotOccupancyPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                      Tidak ada data Control Stock untuk pencarian tersebut.
                    </td>
                  </tr>
                )}
              </tbody>
              
              {/* --- TAMPILAN GRAND TOTAL DI FOOTER TABEL --- */}
              {!loading && filteredData.length > 0 && (
                <tfoot className="bg-slate-100/90 border-t-2 border-slate-200 font-black text-slate-800 text-xs">
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-right uppercase tracking-wider text-slate-700">
                      GRAND TOTAL (ALL RAK)
                    </td>
                    <td className="px-6 py-4 text-right text-blue-700 font-bold text-sm">
                      {grandTotalQtyIn}
                    </td>
                    <td className="px-6 py-4 text-right text-red-700 font-bold text-sm">
                      {grandTotalQtyOut}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-900 font-black text-sm">
                      {grandTotalOnHand}
                    </td>
                    <td className="px-6 py-4 text-right text-purple-700 font-mono font-bold text-sm">
                      {grandTotalVolumeM3.toFixed(3)} M³
                    </td>
                    <td className="px-6 py-4 text-right text-blue-900 font-mono font-black text-sm">
                      {warehouseMetrics.totalUsedVolume.toFixed(3)} / {warehouseMetrics.totalMaxVolume.toFixed(1)} M³
                    </td>
                    <td className="px-6 py-4 text-right text-blue-700 font-bold text-sm">
                      {warehouseMetrics.occupancyPercentage.toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!loading && filteredData.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider gap-2">
              <span>Total Item Terfilter: <span className="text-slate-800 font-black">{filteredData.length} Data</span></span>
              <span>Total Volume Terpakai All Rak: <span className="text-blue-700 font-black">{warehouseMetrics.totalUsedVolume.toFixed(3)} M³ / {warehouseMetrics.totalMaxVolume.toFixed(1)} M³ ({warehouseMetrics.occupancyPercentage.toFixed(1)}%)</span></span>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VOLUME MASING-MASING RAK (SELURUH RAK GUDANG & STATUSNYA) */}
      {activeTab === 'racks' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="w-8 px-4 py-4"></th>
                  <th className="px-6 py-4">POSISI RAK (SLOT)</th>
                  <th className="px-6 py-4">LOKASI RAK</th>
                  <th className="px-6 py-4">ZONA / KATEGORI</th>
                  <th className="px-6 py-4 text-right">TOTAL VOL TERPAKAI</th>
                  <th className="px-6 py-4 text-right">KAPASITAS MAKS</th>
                  <th className="px-6 py-4 text-right">SISA KAPASITAS</th>
                  <th className="px-6 py-4 text-right">TOTAL OCCUPANCY</th>
                  <th className="px-6 py-4 text-right">JUMLAH SKU</th>
                  <th className="px-6 py-4 text-right">TOTAL UNIT</th>
                  <th className="px-6 py-4 text-center">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-500 mb-3" />
                      <p className="font-medium text-sm">Menghitung Volume Seluruh Rak...</p>
                    </td>
                  </tr>
                ) : filteredRacks.length > 0 ? (
                  filteredRacks.map(rack => {
                    const isExpanded = expandedRackId === rack.locatorId;
                    return (
                      <React.Fragment key={rack.locatorId}>
                        <tr 
                          onClick={() => setExpandedRackId(isExpanded ? null : rack.locatorId)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-blue-50/30' : rack.usedVolumeM3 === 0 ? 'opacity-70' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-400">
                            {rack.items.length > 0 ? (
                              isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-blue-600" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )
                            ) : null}
                          </td>
                          <td className="px-6 py-3 font-mono font-bold text-slate-900 flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-slate-100 rounded text-slate-800 text-xs font-black">
                              {rack.locatorId}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-slate-600 font-medium">
                            Rak <strong className="text-slate-800">{rack.rack}</strong>, Kolom {rack.column}, Tingkat {rack.level}
                          </td>
                          <td className="px-6 py-3">
                            <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                              {rack.zone}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right font-mono font-black text-sm">
                            <span className={rack.usedVolumeM3 > 0 ? 'text-blue-900' : 'text-slate-400'}>
                              {rack.usedVolumeM3.toFixed(3)}
                            </span>{' '}
                            <span className="text-[10px] font-normal text-slate-400">M³</span>
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-slate-600 font-bold">
                            {rack.maxVolumeM3.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">M³</span>
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-emerald-700 font-bold">
                            {rack.remainingVolumeM3.toFixed(3)} <span className="text-[10px] font-normal text-slate-400">M³</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    rack.occupancyPct >= 90 ? 'bg-rose-500' :
                                    rack.occupancyPct >= 75 ? 'bg-amber-500' :
                                    rack.occupancyPct > 0 ? 'bg-blue-600' : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${Math.min(100, rack.occupancyPct)}%` }}
                                />
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                rack.occupancyPct >= 90 ? 'bg-rose-100 text-rose-700' :
                                rack.occupancyPct >= 75 ? 'bg-amber-100 text-amber-700' :
                                rack.occupancyPct > 0 ? 'bg-blue-50 text-blue-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {rack.occupancyPct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-slate-800">
                            {rack.itemCount} SKU
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-slate-800">
                            {rack.totalUnits.toLocaleString()}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              rack.status === 'FULL' ? 'bg-rose-100 text-rose-700' :
                              rack.status === 'NEAR_FULL' ? 'bg-amber-100 text-amber-700' :
                              rack.status === 'OPTIMAL' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {rack.status === 'FULL' ? 'Penuh' :
                               rack.status === 'NEAR_FULL' ? 'Hampir Penuh' :
                               rack.status === 'OPTIMAL' ? 'Optimal' : 'Kosong'}
                            </span>
                          </td>
                        </tr>

                        {/* Expandable row: Product Breakdown inside this rack */}
                        {isExpanded && rack.items.length > 0 && (
                          <tr className="bg-slate-50/90">
                            <td colSpan={11} className="px-8 py-3">
                              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-inner space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-600 border-b border-slate-100 pb-2">
                                  <span>Daftar Produk di Rak {rack.locatorId} ({rack.items.length} SKU)</span>
                                  <span className="font-mono text-blue-700">Total Terpakai: {rack.usedVolumeM3.toFixed(3)} M³ / {rack.maxVolumeM3.toFixed(1)} M³</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                                  {rack.items.map((it, idx) => (
                                    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-start text-xs">
                                      <div>
                                        <div className="font-black text-blue-700">{it.sku}</div>
                                        <div className="font-medium text-slate-800 line-clamp-1">{it.name}</div>
                                        <div className="text-[10px] text-slate-500 mt-1">
                                          Stok: <strong className="text-slate-800">{it.onHand} {it.uom}</strong>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-mono font-bold text-purple-700">{it.usedVolumeM3.toFixed(3)} M³</div>
                                        <div className="text-[9px] text-slate-400">({it.volumeM3} M³/unit)</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                      Tidak ada data rak untuk filter tersebut.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* FOOTER TOTAL ALL RAK */}
              {!loading && filteredRacks.length > 0 && (
                <tfoot className="bg-slate-100/90 border-t-2 border-slate-200 font-black text-slate-800 text-xs">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-right uppercase tracking-wider text-slate-700">
                      TOTAL ALL RAK
                    </td>
                    <td className="px-6 py-4 text-right text-blue-900 font-mono font-black text-sm">
                      {filteredRacksTotalUsedVol.toFixed(3)} M³
                    </td>
                    <td className="px-6 py-4 text-right text-slate-700 font-mono font-bold text-sm">
                      {filteredRacksTotalMaxVol.toFixed(1)} M³
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-700 font-mono font-bold text-sm">
                      {filteredRacksTotalRemainingVol.toFixed(3)} M³
                    </td>
                    <td className="px-6 py-4 text-right text-blue-700 font-bold text-sm">
                      {filteredRacksOccupancyPct.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      -
                    </td>
                    <td className="px-6 py-4 text-right text-slate-900 font-black text-sm">
                      {filteredRacksTotalUnits.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!loading && filteredRacks.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider gap-2">
              <span>Menampilkan: <strong className="text-slate-800">{filteredRacks.length} dari {rackVolumeList.length} Slot Rak</strong></span>
              <span>Total Volume Terpakai All Rak: <strong className="text-blue-700 font-mono">{warehouseMetrics.totalUsedVolume.toFixed(3)} M³</strong> dari {warehouseMetrics.totalMaxVolume.toFixed(1)} M³ ({warehouseMetrics.occupancyPercentage.toFixed(1)}%)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
