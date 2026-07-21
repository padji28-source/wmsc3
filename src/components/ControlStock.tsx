import React, { useState, useEffect } from 'react';
import { Layers, Search, RefreshCw, Box, Download } from 'lucide-react';
import { getProducts, getTransactions } from '../lib/db';
import { Product, Transaction } from '../types';

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
}

export function ControlStock({ searchQuery = '' }: { searchQuery?: string }) {
  const [data, setData] = useState<ControlStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const activeSearchValue = searchQuery || localSearch;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [products, transactions] = await Promise.all([
        getProducts(),
        getTransactions()
      ]);

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

      const rows: ControlStockRow[] = [];
      locatorMap.forEach((stats, key) => {
        const [sku, locatorId] = key.split(':::');
        const prod = productMap.get(sku);
        if (prod) {
          const onHand = stats.qtyIn - stats.qtyOut;
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
            onHand: onHand
          });
        }
      });

      // Optional: Add products that have no transactions yet but maybe we just want to focus on existing locators
      // Let's also include products with 0 qty everywhere if they have no locations. Actually we only need them from transactions.
      
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

  const filteredData = data.filter(r => {
    const term = activeSearchValue.toLowerCase();
    return (
      r.sku.toLowerCase().includes(term) ||
      r.name.toLowerCase().includes(term) ||
      r.locatorId.toLowerCase().includes(term) ||
      r.category.toLowerCase().includes(term)
    );
  });

  // --- PERHITUNGAN GRAND TOTAL ---
  const grandTotalQtyIn = filteredData.reduce((sum, row) => sum + row.qtyIn, 0);
  const grandTotalQtyOut = filteredData.reduce((sum, row) => sum + row.qtyOut, 0);
  const grandTotalOnHand = filteredData.reduce((sum, row) => sum + (row.qtyIn + row.qtyOut), 0);

  const exportToCSV = () => {
    if (filteredData.length === 0) return;
    
    // Convert to CSV
    const headers = [
      'KODE PRODUK', 'DESKRIPSI NAMA', 'KATEGORI RAK', 'PACKAGING', 'UOM', 'PACK UOM', 
      'POSISI RAK (SLOT)', 'QTY IN', 'QTY OUT', 'JUMLAH ON HAND'
    ];
    
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row => {
        const packing = row.packingSize || '-';
        const packUom = row.packUom || '-';
        return `"${row.sku}","${row.name}","${row.category}","${packing}","${row.uom}","${packUom}","${row.locatorId}","${row.qtyIn}","${row.qtyOut}","${row.qtyIn + row.qtyOut}"`;
      })
    ].join('\n');

    // Menerapkan qty in + qty out untuk jumlah on hand seperti diminta
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Control_Stock_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Box className="w-6 h-6 text-blue-600" />
            Control Stock
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm">
            Tabel rincian pergerakan (In & Out) dan On-hand Balance per Produk dan Slot Rak.
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
              placeholder="Cari Kode, Nama, Rack..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            onClick={exportToCSV}
            disabled={filteredData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-500 mb-3" />
                    <p className="font-medium text-sm">Menghitung Data Stock...</p>
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
                      {row.qtyIn + row.qtyOut} <span className="text-[10px] font-bold text-slate-500 ml-1">{row.uom}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    Tidak ada data Control Stock untuk pencarian tersebut.
                  </td>
                </tr>
              )}
            </tbody>
            
            {/* --- TAMPILAN GRAND TOTAL DI FOOTER TABEL --- */}
            {!loading && filteredData.length > 0 && (
              <tfoot className="bg-slate-100/80 border-t-2 border-slate-200 font-black text-slate-800 text-xs">
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-right uppercase tracking-wider text-slate-600">
                    Grand Total
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
                </tr>
              </tfoot>
            )}

          </table>
        </div>
        {!loading && filteredData.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Total Item Rak</span>
            <span className="text-sm font-black text-slate-800">{filteredData.length} Data</span>
          </div>
        )}
      </div>
    </div>
  );
}
