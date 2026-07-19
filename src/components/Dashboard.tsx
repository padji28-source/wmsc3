import React, { useEffect, useState } from 'react';
import { Activity, Box, LogIn, LogOut, AlertTriangle, RefreshCw, Clock, X, Search, Zap } from 'lucide-react';
import { WarehouseVisualizer } from './WarehouseVisualizer';
import { getInventoryStats, getTransactions, getProducts, getLocators, getInventoryDetails, addTransaction } from '../lib/db';
import { AuditLog } from './AuditLog';
import { getCurrentUser } from '../lib/auth';
import { v4 as uuidv4 } from 'uuid';

export function Dashboard({ 
  globalSearch = '', 
  onNavigate,
  onSearchQueryChange 
}: { 
  globalSearch?: string;
  onNavigate?: (tab: string) => void;
  onSearchQueryChange?: (query: string) => void;
}) {
  const [stats, setStats] = useState<any>({ occupancy: 0, inbound: 0, outbound: 0 });
  const [todayInboundVolume, setTodayInboundVolume] = useState<number>(0);
  const [todayOutboundCount, setTodayOutboundCount] = useState<number>(0); // Mengubah nama state dari volume menjadi count
  const [pendingOutboundCount, setPendingOutboundCount] = useState<number>(0);
  const [criticalRacks, setCriticalRacks] = useState<any[]>([]);
  const [showCriticalModal, setShowCriticalModal] = useState<boolean>(false);
  const [searchCritical, setSearchCritical] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const user = getCurrentUser();

  const handleAutoAdjust = async (rackId: string, sku: string, currentQty: number, maxQty: number) => {
    try {
      const diff = maxQty - currentQty;
      if (diff >= 0) return;

      const txId = uuidv4();
      const adjustTx = {
        id: txId,
        type: 'OUTBOUND' as const,
        sku: sku,
        qty: diff, // Negative quantity for OUTBOUND subtraction
        locatorId: rackId,
        operator: user?.name || 'System Auto-Adjust',
        timestamp: new Date().toISOString(),
        status: 'CONFIRMED' as const,
        memo: `Auto-Adjust Stock to Max Rack Capacity Limit (dari ${currentQty} ke ${maxQty})`
      };

      await addTransaction(adjustTx);
      setActionMessage({
        type: 'success',
        text: `Sukses menyesuaikan stok ${sku} di rak ${rackId}! Qty telah dikurangi sebanyak ${Math.abs(diff)} unit agar sesuai kapasitas maksimal (${maxQty} Unit).`
      });
      await fetchStats();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      console.error("Gagal melakukan penyesuaian stok:", err);
      setActionMessage({
        type: 'error',
        text: `Gagal melakukan penyesuaian stok: ${(err as Error).message}`
      });
    }
  };

  const fetchStats = async () => {
    setIsRefreshing(true);
    try {
      const [inventoryStats, txs, products, locs, invDetails] = await Promise.all([
        getInventoryStats(),
        getTransactions(),
        getProducts(),
        getLocators(),
        getInventoryDetails()
      ]);

      setStats(inventoryStats);

      // Mapping SKU ke Volume M3 untuk kalkulasi volume Inbound
      const productVolumeMap = products.reduce((acc: Record<string, number>, p: any) => {
        acc[p.sku] = p.volumeM3 || 0;
        return acc;
      }, {});

      const todayString = new Date().toDateString();

      // 1. Akumulasi VOLUME REAL (M³) untuk Inbound HARI INI
      const inboundVolToday = txs
        .filter((tx: any) => 
          tx.type === 'INBOUND' && 
          tx.status !== 'CANCELLED' && 
          new Date(tx.timestamp).toDateString() === todayString
        )
        .reduce((sum: number, tx: any) => {
          const volM3 = productVolumeMap[tx.sku] || 0;
          return sum + (Math.abs(tx.qty || 0) * volM3);
        }, 0);

      // 2. Hitung TOTAL TRANSAKSI Outbound HARI INI (Menggunakan .length & Hapus M3)
      const outboundCountToday = txs
        .filter((tx: any) => 
          tx.type === 'OUTBOUND' && 
          tx.status !== 'CANCELLED' && 
          new Date(tx.timestamp).toDateString() === todayString
        ).length;
      
      // 3. Total antrean Outbound yang masih PENDING atau BOOKED
      const totalPendingOutbound = txs
        .filter((tx: any) => tx.type === 'OUTBOUND' && (tx.status === 'PENDING' || tx.status === 'BOOKED'))
        .length;

      setTodayInboundVolume(inboundVolToday);
      setTodayOutboundCount(outboundCountToday);
      setPendingOutboundCount(totalPendingOutbound);

      // 4. Kalkulasi rack slot dengan okupansi kritis (>= 90%)
      const locatorStats: Record<string, { usedVol: number; maxVol: number; percentage: number; items: { sku: string; name: string; qty: number; volPerUnit: number }[] }> = {};
      locs.forEach(l => {
        locatorStats[l.id] = { usedVol: 0, maxVol: l.maxVolumeM3, percentage: 0, items: [] };
      });

      Object.entries(invDetails).forEach(([sku, data]: [string, any]) => {
        const prod = products.find(p => p.sku === sku);
        const volPerUnit = prod ? prod.volumeM3 : 0;
        
        Object.entries(data.locators).forEach(([locId, locData]: [string, any]) => {
          const qty = locData.physicalQty;
          if (qty > 0 && locatorStats[locId]) {
            locatorStats[locId].usedVol += (qty * volPerUnit);
            locatorStats[locId].items.push({ sku, name: prod?.name || 'Unknown', qty, volPerUnit });
          }
        });
      });

      const criticalList: any[] = [];
      locs.forEach(l => {
        const stat = locatorStats[l.id];
        if (stat) {
          stat.percentage = Math.max(0, Math.round((stat.usedVol / stat.maxVol) * 100));
          if (stat.percentage >= 90) {
            criticalList.push({
              id: l.id,
              rack: l.rack,
              zone: l.zone,
              usedVol: stat.usedVol,
              maxVol: stat.maxVol,
              percentage: stat.percentage,
              items: stat.items
            });
          }
        }
      });

      criticalList.sort((a, b) => b.percentage - a.percentage);
      setCriticalRacks(criticalList);

    } catch (error) {
      console.error("Error fetching dashboard statistics:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Operations Dashboard</h2>
          <p className="text-slate-500 mt-1 text-sm">Real-time inventory and flow status</p>
        </div>
        <button 
          onClick={fetchStats}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Memuat...' : 'Refresh Data'}
        </button>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* 1. Total Occupancy Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Occupancy</p>
            <Box className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex items-end gap-2 mb-2">
            <p className="text-3xl font-bold text-slate-800">{stats?.occupancy || 0}%</p>
            <span className="text-sm font-medium text-emerald-600 pb-1">+2.4%</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="bg-blue-600 h-full" style={{ width: `${stats?.occupancy || 0}%` }}></div>
          </div>
        </div>

        {/* 2. Inbound Per Hari (Volume M³) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inbound Per Hari</p>
            <LogIn className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {todayInboundVolume.toFixed(3)} <span className="text-sm font-semibold text-slate-500 font-mono">M³</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Volume kubikasi masuk hari ini</p>
        </div>

        {/* 3. Outbound Per Hari (JUMLAH TRANSAKSI - TANPA M³) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outbound Per Hari</p>
            <LogOut className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {todayOutboundCount.toLocaleString()} <span className="text-sm font-semibold text-slate-400">Transaksi</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Total order outbound selesai hari ini</p>
        </div>

        {/* 4. Pending Outbound Transactions Card */}
        <div 
          onClick={() => {
            if (onNavigate && onSearchQueryChange) {
              onNavigate('outbound');
              onSearchQueryChange('PENDING'); // or 'BOOKED' / 'PENDING'
            }
          }}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">Pending Outbound</p>
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{pendingOutboundCount}</p>
          <p className="text-sm text-slate-500 mt-1">Active manifest queues pending</p>
        </div>

        {/* 5. Total Stock Alert Card */}
        <div 
          onClick={() => {
            if (criticalRacks.length > 0) {
              setShowCriticalModal(true);
            }
          }}
          className={`p-5 rounded-xl border shadow-sm transition-all relative overflow-hidden ${
            criticalRacks.length > 0 
              ? 'bg-rose-50/45 border-red-200 hover:border-red-400 hover:shadow-md cursor-pointer group' 
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <p className={`text-xs font-bold uppercase tracking-wider ${criticalRacks.length > 0 ? 'text-red-700' : 'text-slate-500'}`}>
              Total Stock Alert
            </p>
            <AlertTriangle className={`w-5 h-5 ${criticalRacks.length > 0 ? 'text-red-600 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {criticalRacks.length} <span className="text-sm font-semibold text-slate-500">Rak/Slot</span>
          </p>
          <p className={`text-xs ${criticalRacks.length > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-medium'} flex items-center gap-1 mt-2`}>
            {criticalRacks.length > 0 ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 animate-bounce shrink-0" />
                <span>Critical action required (Klik detail)</span>
              </>
            ) : (
              <span>● Semua rak di bawah sisa limit</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <WarehouseVisualizer />
      </div>

      {user && (user.role === 'Super Admin' || user.role === 'Developer' || user.role === 'Kepala Gudang JKT') && (
        <div className="mt-12 pt-8 border-t border-slate-200">
          <AuditLog globalSearch={globalSearch} />
        </div>
      )}

      {/* Modal Detail Critical Racks */}
      {showCriticalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-rose-50/50">
              <div>
                <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
                  <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
                  <h3>Critical Action Required: High Occupancy Racks</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">Daftar rak slot yang terisi penuh atau melebihi 90% dari kapasitas kubikasi maksimal (5.4 m³).</p>
              </div>
              <button 
                onClick={() => { setShowCriticalModal(false); setSearchCritical(''); }}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Filter */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Slot Rak (misal: A1.1, FL-A)..."
                  value={searchCritical}
                  onChange={e => setSearchCritical(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder-slate-400 outline-none"
                />
              </div>
              {searchCritical && (
                <button 
                  onClick={() => setSearchCritical('')}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-xs font-bold transition-all"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Action Feedback Banner */}
            {actionMessage && (
              <div className={`p-4 mx-6 mt-4 rounded-xl text-xs font-bold leading-relaxed shadow-sm transition-all flex items-center gap-2 border ${
                actionMessage.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-ping bg-current" />
                <span>{actionMessage.text}</span>
              </div>
            )}

            {/* List Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {criticalRacks.filter(r => 
                r.id.toLowerCase().includes(searchCritical.toLowerCase()) ||
                r.rack.toLowerCase().includes(searchCritical.toLowerCase())
              ).length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic text-sm">
                  Tidak ada slot kritis yang cocok dengan pencarian Anda.
                </div>
              ) : (
                criticalRacks
                  .filter(r => 
                    r.id.toLowerCase().includes(searchCritical.toLowerCase()) ||
                    r.rack.toLowerCase().includes(searchCritical.toLowerCase())
                  )
                  .map((r, idx) => {
                    const isFL = r.rack.startsWith('FL');
                    const cleanZone = r.zone === 'DEFAULT' ? 'FL BUFFER' : r.zone.replace('FG_', 'ZONE ');
                    return (
                      <div key={r.id} className="border border-slate-200 rounded-xl p-4 shadow-sm hover:border-red-300 hover:shadow-md transition-all bg-white relative">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-dashed border-slate-100 pb-2.5 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="p-1 px-2.5 bg-rose-100 text-rose-800 font-mono font-bold text-xs rounded-lg border border-rose-200">
                              {r.id}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isFL 
                                ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                              {cleanZone}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-xs text-slate-400">Occupancy:</span>
                            <span className="text-xs font-bold text-slate-700">{r.usedVol.toFixed(3)} / {r.maxVol.toFixed(1)} m³</span>
                            <span className="text-xs font-black text-rose-600 font-sans">({r.percentage}%)</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-3">
                          <div className="bg-rose-500 h-full rounded-full" style={{ width: `${Math.min(100, r.percentage)}%` }}></div>
                        </div>

                        {/* Stored Items inside Slot */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Daftar Material Tersimpan & Batas Kapasitas:</p>
                          {r.items.map((it: any, iIdx: number) => {
                            const maxAmount = it.volPerUnit > 0 ? Math.floor(r.maxVol / it.volPerUnit) : 0;
                            const isOverCap = it.qty > maxAmount;
                            return (
                              <div key={iIdx} className="flex flex-col md:flex-row md:items-center justify-between gap-3 border border-slate-100 bg-slate-50/75 p-3 rounded-xl hover:bg-slate-50 hover:border-slate-200 transition-all font-medium text-slate-700">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="p-1 px-2 bg-slate-200 text-slate-800 font-mono font-bold text-[10px] rounded border border-slate-300 shrink-0">
                                    {it.sku}
                                  </span>
                                  <span className="text-slate-400 font-mono text-[10px] shrink-0">|</span>
                                  <span className="truncate text-xs font-bold text-slate-700 max-w-[200px] xl:max-w-xs">{it.name}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 shrink-0">
                                  <div className="flex items-center gap-1 font-sans text-[11px] text-slate-500">
                                    <span>Stok:</span>
                                    <span className={`font-mono font-black px-2 py-0.5 rounded shadow-sm text-xs border ${
                                      isOverCap 
                                        ? 'bg-rose-100 text-rose-700 border-rose-200 animate-pulse' 
                                        : 'bg-white text-slate-800 border-slate-200'
                                    }`}>
                                      {it.qty} Unit
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 font-sans text-[11px] text-slate-500">
                                    <span>Kapasitas Rak:</span>
                                    <span className="font-mono font-black bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded shadow-sm text-xs">
                                      {maxAmount === 0 ? 'N/A' : `Maks ${maxAmount} Unit`}
                                    </span>
                                  </div>
                                  {isOverCap && maxAmount > 0 && (
                                    <button 
                                      onClick={() => handleAutoAdjust(r.id, it.sku, it.qty, maxAmount)}
                                      className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider shadow-sm cursor-pointer transition-all hover:scale-[1.02]"
                                    >
                                      <Zap className="w-3.5 h-3.5 fill-current shrink-0 text-yellow-300" />
                                      Pangkas ke {maxAmount} Unit
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => { setShowCriticalModal(false); setSearchCritical(''); }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all hover:shadow"
              >
                Tutup Detail
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}